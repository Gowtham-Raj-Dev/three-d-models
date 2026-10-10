import { Mail } from "lucide-react";
import { CopyButton } from "@/components/copy-button";
import { TextLink, TextList, TextPage, TextSection } from "@/components/text-page";
import { button } from "@/components/ui";
import { pageMetadata } from "@/lib/seo";
import { SITE } from "@/lib/site";

export const metadata = pageMetadata({
  title: "Contact — Questions, Fixes and Removal Requests",
  description: `Contact ${SITE.name} by email at ${SITE.email}: questions, bug reports, a model with the wrong credit or license, removal requests and privacy questions.`,
  path: "/contact/",
});

export default function ContactPage() {
  return (
    <TextPage
      eyebrow="Contact"
      title="Get in touch."
      intro="A question, a bug, a model with the wrong credit, or something that should be taken down — write to us by email."
    >
      <section className="rounded-2xl border border-line bg-surface/60 p-6">
        <h2 className="text-sm font-medium text-muted">Email</h2>
        <p className="mt-2 text-xl font-semibold tracking-tight break-all sm:text-2xl">{SITE.email}</p>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <a href={`mailto:${SITE.email}`} className={button.primary}>
            <Mail className="size-4" /> Write an email
          </a>
          <CopyButton text={SITE.email} label="Copy address" />
        </div>
      </section>

      <TextSection title="What to include">
        <TextList>
          <li>
            <span className="text-fg">A problem with a model or a download</span> — the address of the model&apos;s page, and what
            went wrong (which file, which app or engine you opened it in).
          </li>
          <li>
            <span className="text-fg">A wrong credit or license, or a removal request</span> — the address of the model&apos;s page, what
            should change, and how we can tell the model is yours. See <TextLink href="/terms/#copyright">copyright complaints</TextLink>{" "}
            in the terms.
          </li>
          <li>
            <span className="text-fg">A bug in a game or a tool</span> — which game, the viewer or the scene builder, plus your device
            and browser.
          </li>
          <li>
            <span className="text-fg">A privacy question</span> — the <TextLink href="/privacy/">Privacy Policy</TextLink> explains what
            the site does with data; ask us about anything it leaves open.
          </li>
        </TextList>
      </TextSection>

      <TextSection title="Before you write">
        <p>Some answers are already on the site:</p>
        <TextList>
          <li>
            <TextLink href="/#faq">Frequently asked questions</TextLink> — what a download contains and which tools open the files.
          </li>
          <li>
            <TextLink href="/license/">Licensing</TextLink> — what you may do with the models, and how to credit an author.
          </li>
          <li>
            <TextLink href="/developers/">For developers &amp; AI</TextLink> — loading the models by URL and reading the catalog files.
          </li>
        </TextList>
      </TextSection>

      <TextSection title="Email only">
        <p>
          The site has no contact form and no accounts, so email is the way to reach us. We use your address and your message only
          to answer you.
        </p>
      </TextSection>
    </TextPage>
  );
}
