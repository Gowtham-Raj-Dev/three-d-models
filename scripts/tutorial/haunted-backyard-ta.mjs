/**
 * The haunted backyard tutorial in Tamil — the same choreography as haunted-backyard.mjs, narrated the
 * way Tamil tutorials are spoken: Tamil with the builder's own words (New project, Array, Export…)
 * left in English. The lines keep the English file's keys; the recording paces itself by them.
 *
 * The voice is Gemini TTS ("Achernar"), which speaks Tamil and English in one breath — Chatterbox,
 * the English video's voice, is English only. Needs a Gemini API key (GEMINI_API_KEY, or the one in
 * .env.development.local).
 */
export { before, run } from "./haunted-backyard.mjs";

export const meta = {
  id: "haunted-backyard-ta",
  title: "Haunted backyard-ஐ empty plot-ல இருந்து build பண்ணலாம் — Scene Builder tutorial (தமிழ்)",
  route: "/builder/",
};

export const voice = {
  engine: "gemini",
  model: "gemini-3.8-flash-tts",
  name: "Achernar",
  /** The whole narration in one request: one take, so one voice from the first line to the last. */
  batch: 100,
  style: "Read this in a warm, smooth, friendly female voice, like a Tamil YouTuber explaining a tutorial in natural Chennai-style Tanglish. Relaxed pace. Keep the same voice and energy from start to finish, and stop for a full second of silence after every paragraph:",
};

export const lines = {
  "intro-1": { say: "இந்த haunted backyard-அ Scene Builder-ல நாம build பண்ணப் போறோம். Fence போட்ட ஒரு graveyard, ஒரு crypt, எரியுற lanterns, அப்புறம் உண்மையாவே move ஆகுற skeletons." },
  "intro-2": { say: "ஒரு empty plot-ல இருந்து start பண்ணி, step by step-ஆ build பண்ணலாம். இது முழுக்க free, உங்க browser-லயே ஓடும்." },

  "new-1": { say: "Step one. New project click பண்ணுங்க. ஒரு name குடுங்க, Empty plot-உம் Day lighting-உம் அப்படியே இருக்கட்டும், create பண்ணுங்க. பகல் வெளிச்சத்துல build பண்றது easy. கடைசில night-க்கு மாத்திக்கலாம்." },
  "new-2": {
    say: "எதுவும் select பண்ணாம இருந்தா, right side panel-ல scene settings தெரியும். Ground-அ Dark-னு மாத்துங்க, size-அ நூத்தி அறுபது metre ஆக்குங்க.",
    sub: "எதுவும் select பண்ணாம இருந்தா, right side panel-ல scene settings தெரியும். Ground-அ Dark-னு மாத்துங்க, size-அ 160 m ஆக்குங்க.",
  },

  "floor-1": {
    say: "Step two, floor. Left side-ல Halloween kit already open-ஆ இருக்கு. Grid step-அ நாலு metre-னு வைங்க. இந்த floor tiles நாலு metre அகலம், அதனால இப்போ அது perfect-ஆ ஒட்டிக்கும்.",
    sub: "Step two, floor. Left side-ல Halloween kit already open-ஆ இருக்கு. Grid step-அ 4 m-னு வைங்க. இந்த floor tiles 4 m அகலம், அதனால இப்போ அது perfect-ஆ ஒட்டிக்கும்.",
  },
  "floor-2": { say: "Floor Dirt-அ pick பண்ணி, scene-ல தூரத்து corner-ல click பண்ணி first tile-அ வைங்க." },
  "ground-1": {
    say: "பாருங்க, அது flicker ஆகுது. ஏன்னா அதோட top, ground-ஓட same level-ல இருக்கு. Escape அழுத்தி, ground level-அ minus zero point five-னு குறைங்க. இப்போ floor தெளிவா தெரியுது.",
    sub: "பாருங்க, அது flicker ஆகுது. ஏன்னா அதோட top, ground-ஓட same level-ல இருக்கு. Esc அழுத்தி, ground level-அ −0.5-னு குறைங்க. இப்போ floor தெளிவா தெரியுது.",
  },
  "floor-3": {
    say: "Tile-அ select பண்ணா, inspector-ல அதோட settings வரும். கீழ scroll பண்ணி Array tool-ல, ஒம்பது copies, நாலு metre இடைவெளி-னு குடுங்க. ஒரு முழு row ready.",
    sub: "Tile-அ select பண்ணா, inspector-ல அதோட settings வரும். கீழ scroll பண்ணி Array tool-ல, 9 copies, 4 m இடைவெளி-னு குடுங்க. ஒரு முழு row ready.",
  },
  "floor-4": {
    say: "Control A அழுத்தி முழு row-வையும் select பண்ணுங்க, Control D அழுத்தி duplicate பண்ணுங்க, அப்புறம் arrow keys வெச்சு அந்த copy-அ சரியான இடத்துக்கு நகர்த்துங்க. Floor முடியுற வரைக்கும் இதையே repeat பண்ணுங்க.",
    sub: "Ctrl+A அழுத்தி முழு row-வையும் select பண்ணுங்க, Ctrl+D அழுத்தி duplicate பண்ணுங்க, அப்புறம் arrow keys வெச்சு அந்த copy-அ சரியான இடத்துக்கு நகர்த்துங்க. Floor முடியுற வரைக்கும் இதையே repeat பண்ணுங்க.",
  },
  "floor-5": { say: "Open grave-க்கு, ஒரு tile-அ click பண்ணி delete பண்ணிட்டு, அந்த gap-ல Floor Dirt Grave-அ வைங்க." },
  "grave-2": { say: "அது கீழ இறக்கின ground மேல உக்காரும், அதனால அதோட Y position-அ திரும்ப zero ஆக்குங்க.", sub: "அது கீழ இறக்கின ground மேல உக்காரும், அதனால அதோட Y position-அ திரும்ப 0 ஆக்குங்க." },
  "floor-6": { say: "Control A, அப்புறம் L அழுத்தி floor-அ lock பண்ணுங்க. இனிமே தெரியாம அத நகர்த்த முடியாது.", sub: "Ctrl+A, அப்புறம் L அழுத்தி floor-அ lock பண்ணுங்க. இனிமே தெரியாம அத நகர்த்த முடியாது." },

  "fence-1": {
    say: "Step three, fence. Grid step-அ ரெண்டு metre ஆக்குங்க. Fence-அ pick பண்ணி, பின்னாடி edge-ல ஒரு piece வெச்சு, array பண்ணுங்க. ஏழு copies, நாலு metre இடைவெளி.",
    sub: "Step three, fence. Grid step-அ 2 m ஆக்குங்க. Fence-அ pick பண்ணி, பின்னாடி edge-ல ஒரு piece வெச்சு, array பண்ணுங்க. 7 copies, 4 m இடைவெளி.",
  },
  "fence-2": {
    say: "Sides-க்கு, fence-அ மறுபடியும் pick பண்ணி, click பண்றதுக்கு முன்னாடி Shift-உம் right bracket-உம் அழுத்தி தொண்ணூறு degree திருப்புங்க. இந்த தடவ X-க்கு பதிலா Z-ல array பண்ணுங்க.",
    sub: "Sides-க்கு, fence-அ மறுபடியும் pick பண்ணி, click பண்றதுக்கு முன்னாடி Shift + ] அழுத்தி 90° திருப்புங்க. இந்த தடவ X-க்கு பதிலா Z-ல array பண்ணுங்க.",
  },
  "fence-3": { say: "அதே மாதிரி இன்னொரு side-லயும், முன்னாடியும் பண்ணுங்க. நடுவுல Arch Gate-க்கு ஒரு gap விடுங்க." },
  "fence-4": { say: "அப்புறம் ஒவ்வொரு joint-லயும் ஒரு Fence Pillar வைங்க. Shift அழுத்திக்கிட்டே click பண்ணா, அந்த part கையிலயே இருக்கும்." },
  "fence-5": { say: "சில pieces-அ broken version-ஆ மாத்துங்க, அப்போதான் பழசா தெரியும்." },

  "path-1": {
    say: "Step four. Fine work-க்கு grid step-அ அரை metre ஆக்கி, gate-ல இருந்து பின்னாடி வரைக்கும் ஒரு path போடுங்க. நாலு path pieces இருக்கு, mix பண்ணி வைங்க.",
    sub: "Step four. Fine work-க்கு grid step-அ 0.5 m ஆக்கி, gate-ல இருந்து பின்னாடி வரைக்கும் ஒரு path போடுங்க. நாலு path pieces இருக்கு, mix பண்ணி வைங்க.",
  },
  "crypt-1": { say: "எந்த part-அயும் சீக்கிரம் கண்டுபிடிக்க, search பண்ணுங்க. crypt-னு type பண்ணி, path முடியுற இடத்துல வைங்க. அப்புறம் அதோட கதவு பக்கத்துல skull candles-உம் candle clusters-உம் வைங்க." },

  "graves-1": { say: "Step five, graves. Path-ஓட ரெண்டு பக்கமும் ரெண்டு block-ஆ வைங்க. Shift அழுத்தி சிலது stamp பண்ணுங்க, அப்புறம் வேற headstone-க்கு மாறுங்க. அப்போதான் எல்லா row-உம் ஒரே மாதிரி தெரியாது." },
  "graves-2": { say: "Open grave பக்கத்துல ஒரு coffin, crypt பக்கத்துல இன்னொன்னு, side fence ஓரமா ஒரு bench-உம் ஒரு candle shrine-உம் வைங்க." },

  "skel-1": { say: "Step six, இங்க குடியிருக்கிறவங்க. Skeletons kit-க்கு மாறி, path பக்கத்துல ஒரு Skeleton Warrior-அ வைங்க." },
  "skel-2": { say: "Animated parts-க்கு inspector-ல ஒரு Animation menu வரும். Idle Combat-னு search பண்ணி select பண்ணுங்க. இப்போ அவன் சண்டைக்கு ready." },
  "skel-3": { say: "Square bracket keys வெச்சு அவன திருப்புங்க, ஒரு தடவைக்கு பதினஞ்சு degree.", sub: "Square bracket keys வெச்சு அவன திருப்புங்க, ஒரு தடவைக்கு 15°." },
  "skel-4": { say: "Spell போடுற ஒரு mage, ஒரு rogue, ரெண்டு minions add பண்ணுங்க. Open grave-ல இருக்கிறவனுக்கு Skeletons Awaken Floor Long-னு choose பண்ணுங்க. அவன் மண்ணுக்குள்ள இருந்து திரும்பத் திரும்ப மேல ஏறி வருவான்." },

  "night-1": { say: "Step eight, light. மூணு அழுத்தி scene-அ night-க்கு மாத்துங்க. ரொம்ப இருட்டா இருக்குல்ல? அத சரி பண்ணலாம்.", sub: "Step eight, light. 3 அழுத்தி scene-அ night-க்கு மாத்துங்க. ரொம்ப இருட்டா இருக்குல்ல? அத சரி பண்ணலாம்." },
  "light-1": { say: "Gate-ஓட ரெண்டு பக்கமும் ஒரு Post Lantern வைங்க." },
  "light-2": { say: "Lantern வெறும் model தான். அது எரியணும்னா, parts list மேல இருக்கிற Point light-அ click பண்ணி, அதுக்கு பக்கத்துல ஒன்னு வைங்க." },
  "light-3": { say: "Inspector-ல Y position வெச்சு அத lamp உயரத்துக்கு தூக்குங்க. அதோட colour, power, range-ஐயும் மாத்தலாம். Flame flicker போட்டா, அது உண்மையான candle மாதிரி ஆடும்." },
  "light-4": { say: "ஒவ்வொரு lantern-க்கும், candle-க்கும், pumpkin-க்கும் ஒரு சின்ன light குடுங்க. அதுதான் night scene-க்கு உயிர் குடுக்கும்." },

  "trees-1": { say: "Step seven, scene-அ அலங்கரிக்கலாம். மறுபடியும் Halloween kit-க்கு வந்து, fence உள்ள dead trees-உம், வெளிய autumn pines-உம் வைங்க. Select பண்ண part-அ பெருசு சின்னது பண்ண, plus இல்ல minus அழுத்துங்க." },
  "scatter-1": { say: "சின்ன சின்ன பொருளுக்கு, ஒரு pumpkin வெச்சுட்டு Scatter use பண்ணுங்க. அது copies-அ random இடத்துல, random size-ல, random angle-ல போடும், ஒன்னு மேல ஒன்னு விழாது. Bones-க்கும் candles-க்கும் இதையே பண்ணுங்க." },

  "end-1": { say: "அவ்வளவுதான், haunted backyard ready. Side panels-அ hide பண்ணி, Shift F அழுத்தி முழு scene-ஐயும் frame பண்ணுங்க.", sub: "அவ்வளவுதான், haunted backyard ready. Side panels-அ hide பண்ணி, Shift+F அழுத்தி முழு scene-ஐயும் frame பண்ணுங்க." },
  "end-2": { say: "Drag பண்ணா orbit, right drag பண்ணா pan, scroll பண்ணா zoom." },
  "end-3": {
    say: "திருப்தியா இருந்தா, Export click பண்ணுங்க. எல்லா animation-உம் உள்ள இருக்கிற ஒரே ஒரு G L B file கிடைக்கும். Blender, Unity, Godot, three J S எல்லாத்துக்கும் ready. இல்லன்னா project file-உம் licences-உம் சேர்ந்த ஒரு zip.",
    sub: "திருப்தியா இருந்தா, Export click பண்ணுங்க. எல்லா animation-உம் உள்ள இருக்கிற ஒரே ஒரு GLB file கிடைக்கும். Blender, Unity, Godot, three.js எல்லாத்துக்கும் ready. இல்லன்னா project file-உம் licences-உம் சேர்ந்த ஒரு zip.",
  },
  "end-4": { say: "Time இல்லையா? New project-ல Haunted backyard ஒரு ready made template-ஆவும் இருக்கு. Build பண்ணி enjoy பண்ணுங்க!" },
};
