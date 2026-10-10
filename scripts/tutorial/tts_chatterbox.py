"""
Narration with Chatterbox Turbo (Resemble AI, MIT) through ONNX Runtime — the reference script from
https://huggingface.co/ResembleAI/chatterbox-turbo-ONNX, made to survive a small, busy machine:

  python tts_chatterbox.py job.json

job.json: { "model": dir, "voice": 24 kHz mono 16-bit wav, "cond": npz, "temperature": 0.8,
            "lines": [{ "text": "...", "out": "line.wav", "seed": 1 }] }

Every line is written as soon as it is spoken, and lines whose file exists are skipped — so when the
process dies (out of memory, usually) voice.mjs just starts it again and it carries on. The reference
voice's conditioning is worked out once and kept in job["cond"].
"""
import gc
import json
import os
import sys
import time
import wave

import numpy as np
import onnxruntime as ort

SAMPLE_RATE = 24000
START_SPEECH_TOKEN = 6561
STOP_SPEECH_TOKEN = 6562
SILENCE_TOKEN = 4299
NUM_KV_HEADS = 16
HEAD_DIM = 64
TOP_K = 1000
TOP_P = 0.95
REPETITION_PENALTY = 1.2


def session(model_dir, name):
    options = ort.SessionOptions()
    options.log_severity_level = 3
    # Without pre-packing, ONNX Runtime keeps the weights memory-mapped from the .onnx_data file
    # instead of copying them: the 1.2 GB language model then costs a few MB of committed memory, not
    # 1.2 GB (measured), and runs a little slower. The arena stays on: it holds on to the memory the
    # first sentence needed, so later ones don't have to ask a system that may have none left.
    options.add_session_config_entry("session.disable_prepacking", "1")
    return ort.InferenceSession(f"{model_dir}/onnx/{name}.onnx", options, providers=["CPUExecutionProvider"])


def read_wav(path):
    with wave.open(path, "rb") as w:
        if w.getframerate() != SAMPLE_RATE or w.getnchannels() != 1 or w.getsampwidth() != 2:
            raise SystemExit(f"{path}: need {SAMPLE_RATE} Hz mono 16-bit")
        data = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16)
    return (data.astype(np.float32) / 32768.0)[np.newaxis, :]


def write_wav(path, audio):
    peak = float(np.max(np.abs(audio))) if audio.size else 0.0
    if peak > 0.9:  # leave headroom instead of clipping
        audio = audio * (0.9 / peak)
    pcm = (np.clip(audio, -1, 1) * 32767).astype(np.int16)
    # Under a temporary name first: a file with the final name is always a whole line.
    with wave.open(path + ".part", "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SAMPLE_RATE)
        w.writeframes(pcm.tobytes())
    os.replace(path + ".part", path)


def normalise(text):
    """Chatterbox's own clean-up: tidy spacing, plain punctuation, and always end the sentence."""
    text = " ".join(text.split())
    if text and text[0].islower():
        text = text[0].upper() + text[1:]
    for old, new in [("...", ", "), ("…", ", "), (":", ","), (" - ", ", "), (";", ", "), ("—", "-"), ("–", "-"), (" ,", ","), ("“", '"'), ("”", '"'), ("‘", "'"), ("’", "'")]:
        text = text.replace(old, new)
    text = text.rstrip(" ")
    if not text.endswith((".", "!", "?", "-", ",")):
        text += "."
    return text


def pick(logits, history, rng, temperature):
    """Repetition penalty, then temperature / top-k / top-p sampling (greedy when temperature is 0)."""
    logits = logits.astype(np.float64).copy()
    seen = np.unique(history)
    logits[seen] = np.where(logits[seen] < 0, logits[seen] * REPETITION_PENALTY, logits[seen] / REPETITION_PENALTY)
    if temperature <= 0:
        return int(np.argmax(logits))
    logits /= temperature
    if TOP_K < logits.size:
        logits[logits < np.partition(logits, -TOP_K)[-TOP_K]] = -np.inf
    order = np.argsort(-logits)
    probs = np.exp(logits[order] - logits[order[0]])
    probs /= probs.sum()
    keep = np.cumsum(probs) - probs < TOP_P
    probs = probs[keep] / probs[keep].sum()
    return int(order[keep][rng.choice(probs.size, p=probs)])


def main():
    job = json.load(open(sys.argv[1], encoding="utf-8"))
    model_dir = job["model"]
    temperature = float(job.get("temperature", 0.8))
    todo = [line for line in job["lines"] if not os.path.exists(line["out"])]
    if not todo:
        return

    if not os.path.exists(job["cond"]):
        encoder = session(model_dir, "speech_encoder")
        cond_emb, prompt_token, speaker_embeddings, speaker_features = encoder.run(None, {"audio_values": read_wav(job["voice"])})
        np.savez(job["cond"] + ".part.npz", cond_emb=cond_emb, prompt_token=prompt_token, speaker_embeddings=speaker_embeddings, speaker_features=speaker_features)
        os.replace(job["cond"] + ".part.npz", job["cond"])
        del encoder
        gc.collect()
    cond = np.load(job["cond"])
    cond_emb = cond["cond_emb"]

    from tokenizers import Tokenizer

    tokenizer = Tokenizer.from_file(f"{model_dir}/tokenizer.json")
    embed = session(model_dir, "embed_tokens")
    lm = session(model_dir, job.get("lm", "language_model"))
    decoder = session(model_dir, "conditional_decoder")
    cache_inputs = [(i.name, np.float16 if i.type == "tensor(float16)" else np.float32) for i in lm.get_inputs() if "past_key_values" in i.name]
    for n, line in enumerate(todo):
        text = normalise(line["text"])
        rng = np.random.default_rng(int(line.get("seed", 0)))
        input_ids = np.array([tokenizer.encode(text).ids], dtype=np.int64)
        # A sentence never needs more than ~20 tokens (0.8 s) per word; stops a line that won't end.
        limit = min(1024, 60 + 20 * len(text.split()))
        generated = [START_SPEECH_TOKEN]
        t0 = time.time()
        for i in range(limit):
            inputs_embeds = embed.run(None, {"input_ids": input_ids})[0]
            if i == 0:
                inputs_embeds = np.concatenate((cond_emb, inputs_embeds), axis=1)
                seq_len = inputs_embeds.shape[1]
                past = {name: np.zeros([1, NUM_KV_HEADS, 0, HEAD_DIM], dtype=dtype) for name, dtype in cache_inputs}
                attention_mask = np.ones((1, seq_len), dtype=np.int64)
                position_ids = np.arange(seq_len, dtype=np.int64).reshape(1, -1)
            logits, *present = lm.run(None, dict(inputs_embeds=inputs_embeds, attention_mask=attention_mask, position_ids=position_ids, **past))
            token = pick(logits[0, -1, :], np.array(generated), rng, temperature)
            generated.append(token)
            if token == STOP_SPEECH_TOKEN:
                break
            input_ids = np.array([[token]], dtype=np.int64)
            attention_mask = np.concatenate([attention_mask, np.ones((1, 1), dtype=np.int64)], axis=1)
            position_ids = position_ids[:, -1:] + 1
            for j, (name, _) in enumerate(cache_inputs):
                past[name] = present[j]
        ended = generated[-1] == STOP_SPEECH_TOKEN
        speech = [t for t in generated[1:] if t < START_SPEECH_TOKEN]
        speech_tokens = np.concatenate([cond["prompt_token"], np.array([speech + [SILENCE_TOKEN] * 3], dtype=np.int64)], axis=1)
        wav = decoder.run(None, dict(speech_tokens=speech_tokens, speaker_embeddings=cond["speaker_embeddings"], speaker_features=cond["speaker_features"]))[0].squeeze(axis=0)
        write_wav(line["out"], wav)
        print(f"[{n + 1}/{len(todo)}] {len(speech) / 25:.1f} s of speech in {time.time() - t0:.0f} s{'' if ended else '  (hit the length limit)'}  {text[:60]}", flush=True)


if __name__ == "__main__":
    main()
