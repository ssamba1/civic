import type { Metadata } from "next";
import {
  Callout,
  CONTACT,
  GOVERNING_LAW,
  LegalShell,
  List,
  ORG,
  P,
  Section,
  Sub,
} from "@/components/legal/legal-shell";

export const metadata: Metadata = {
  title: "Terms of Service",
  description:
    "The agreement governing your use of Civic — accounts, your reports, acceptable use, and disclaimers.",
};

export default function TermsPage() {
  return (
    <LegalShell
      eyebrow="Legal"
      title="Terms of Service"
      otherDoc={{ href: "/privacy", label: "Read the Privacy Policy" }}
      intro={
        <>
          These Terms of Service (&ldquo;Terms&rdquo;) are an agreement between
          you and {ORG} (&ldquo;Civic&rdquo;, &ldquo;we&rdquo;,
          &ldquo;us&rdquo;) governing your use of the Civic app and website. By
          using Civic, you agree to these Terms. If you don&rsquo;t agree,
          don&rsquo;t use Civic.
        </>
      }
    >
      <Callout tone="danger" title="Civic is not an emergency service">
        <P>
          <strong>Do not use Civic to report emergencies.</strong> Civic is not
          monitored around the clock, and reports are not guaranteed to be seen
          or acted on quickly. If there is an immediate threat to life, safety,
          or property — a fire, a downed power line, a crash, a gas leak — call{" "}
          <strong>911</strong> or your local emergency number.
        </P>
      </Callout>

      <Section id="eligibility" n={1} title="Who can use Civic">
        <P>
          You must be at least 13 years old to use Civic. By using Civic, you
          confirm you meet this requirement and can form a binding agreement.
        </P>
      </Section>

      <Section id="service" n={2} title="What Civic does">
        <P>
          Civic lets you photograph and report public infrastructure issues. We
          use automated classification to triage reports and forward them to the
          responsible city. Civic is a reporting tool — we are not a government
          agency, and we do not repair infrastructure ourselves.
        </P>
      </Section>

      <Section id="account" n={3} title="Your account">
        <List
          items={[
            <>
              You may use Civic with a Google account, an email and password, or
              an anonymous guest session.
            </>,
            <>
              Keep your login credentials secure; you are responsible for
              activity under your account.
            </>,
            <>Provide accurate information and keep it current.</>,
          ]}
        />
      </Section>

      <Section id="content" n={4} title="Your reports and content">
        <Sub title="Ownership and license">
          <P>
            You keep ownership of the photos and content you submit. You grant
            Civic a worldwide, non-exclusive, royalty-free license to host,
            store, process, blur, display, and share that content as needed to
            operate Civic — including sharing reports with the relevant city and
            displaying blurred photos publicly within the app.
          </P>
        </Sub>
        <Sub title="Your responsibilities for what you submit">
          <List
            items={[
              <>
                You have the right to capture and submit the photo, and doing so
                does not break any law or violate anyone&rsquo;s rights.
              </>,
              <>
                You will photograph the{" "}
                <strong>infrastructure issue only</strong>, and avoid capturing
                identifiable people, bystanders, or readable license plates.
                (Automatic blurring is a safeguard, not a guarantee — see the
                Privacy Policy.)
              </>,
              <>Your reports are truthful and submitted in good faith.</>,
            ]}
          />
        </Sub>
      </Section>

      <Section id="acceptable-use" n={5} title="Acceptable use">
        <P>You agree not to:</P>
        <List
          items={[
            <>Submit false, misleading, or spam reports.</>,
            <>Upload illegal, harassing, hateful, or infringing content.</>,
            <>Photograph people to harass, surveil, or harm them.</>,
            <>Attempt to bypass rate limits or security measures.</>,
            <>Reverse-engineer, scrape, or overload the service.</>,
            <>Upload malware or malicious code.</>,
            <>Impersonate others or misrepresent your affiliation.</>,
            <>Use Civic for any unlawful purpose.</>,
          ]}
        />
      </Section>

      <Section
        id="ai-disclaimer"
        n={6}
        title="Automated classification and city action"
      >
        <List
          items={[
            <>
              Civic&rsquo;s AI classification is automated and{" "}
              <strong>may be inaccurate</strong>. We do not warrant that any
              classification, severity, or emergency flag is correct.
            </>,
            <>
              Submitting a report <strong>does not guarantee</strong> that any
              issue will be seen, prioritized, or fixed. Cities decide what to
              do with reports on their own terms and timelines.
            </>,
            <>
              Civic is not responsible for a city&rsquo;s action, inaction, or
              response time.
            </>,
          ]}
        />
      </Section>

      <Section id="third-party" n={7} title="Third-party services">
        <P>
          Civic relies on third-party services (including Google, Supabase,
          mapping providers, and sign-in providers). Your use of features
          powered by them may also be subject to their terms, and we are not
          responsible for third-party services.
        </P>
      </Section>

      <Section id="ip" n={8} title="Intellectual property">
        <P>
          Civic — including its software, design, and branding — is owned by{" "}
          {ORG} and protected by intellectual-property laws. These Terms
          don&rsquo;t grant you rights to our trademarks or to copy the app,
          except to use Civic as intended.
        </P>
      </Section>

      <Section id="disclaimers" n={9} title="Disclaimers">
        <P>
          Civic is provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo;,
          without warranties of any kind, express or implied, including
          merchantability, fitness for a particular purpose, accuracy, and
          non-infringement. We do not warrant that Civic will be uninterrupted,
          error-free, or secure, or that classifications or routing will be
          accurate.
        </P>
      </Section>

      <Section id="liability" n={10} title="Limitation of liability">
        <P>
          To the maximum extent permitted by law, {ORG} and its team will not be
          liable for any indirect, incidental, special, consequential, or
          punitive damages, or for any loss arising from your use of (or
          inability to use) Civic, your reliance on a classification, or any
          city&rsquo;s response or lack of response.
        </P>
      </Section>

      <Section id="indemnification" n={11} title="Indemnification">
        <P>
          You agree to indemnify and hold {ORG} harmless from claims and costs
          arising out of your content, your use of Civic, or your violation of
          these Terms or any law.
        </P>
      </Section>

      <Section id="termination" n={12} title="Termination">
        <P>
          You can stop using Civic at any time. We may suspend or terminate your
          access if you violate these Terms or to protect Civic or its users.
          Some report records may remain with cities after your account is
          closed.
        </P>
      </Section>

      <Section id="changes" n={13} title="Changes to Civic and these Terms">
        <P>
          We may change Civic or these Terms. We&rsquo;ll update the &ldquo;Last
          updated&rdquo; date, and significant changes may be highlighted in the
          app. Continued use after changes means you accept the new Terms.
        </P>
      </Section>

      <Section id="governing-law" n={14} title="Governing law">
        <P>
          These Terms are governed by the laws of {GOVERNING_LAW}, without
          regard to conflict-of-law rules.
        </P>
      </Section>

      <Section id="contact" n={15} title="Contact">
        <P>
          Questions about these Terms? Contact {ORG} at {CONTACT}.
        </P>
      </Section>
    </LegalShell>
  );
}
