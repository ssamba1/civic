import type { Metadata } from "next";
import {
  Callout,
  CONTACT,
  LegalShell,
  List,
  ORG,
  P,
  Section,
  Sub,
} from "@/components/legal/legal-shell";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "How Civic collects, uses, shares, and protects your information, including photos, location, and AI classification.",
};

export default function PrivacyPage() {
  return (
    <LegalShell
      eyebrow="Legal"
      title="Privacy Policy"
      otherDoc={{ href: "/terms", label: "Read the Terms of Service" }}
      intro={
        <>
          This Privacy Policy explains what information Civic
          (&ldquo;Civic&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;), operated by{" "}
          {ORG}, collects when you use our infrastructure-reporting app, how we
          use and share it, and the choices you have. Civic lets residents
          photograph and report public infrastructure issues, like potholes and
          broken streetlights, so they can be classified and routed to the
          responsible city.
        </>
      }
    >
      <Section id="collect" n={1} title="Information we collect">
        <Sub title="Account information">
          <List
            items={[
              <>
                <strong>Sign-in method</strong>, a Google account, an email and
                password, or an anonymous guest session. Guest sessions let you
                report without giving us an email.
              </>,
              <>
                <strong>Email address</strong>, if you sign in with email or
                Google.
              </>,
              <>
                <strong>Display name</strong>, if you choose to add one.
              </>,
              <>
                A <strong>user ID</strong> we generate to associate reports with
                your account.
              </>,
            ]}
          />
        </Sub>
        <Sub title="Reports you submit">
          <List
            items={[
              <>
                <strong>Photos</strong> of the issue (see{" "}
                <em>How we handle your photos</em> below).
              </>,
              <>
                Your device&rsquo;s <strong>GPS location</strong> at the time of
                the report, used to place the issue on the map and identify the
                responsible city. You can decline location access, but reports
                are less accurate and may not route correctly without it.
              </>,
              <>An optional street address or written description you add.</>,
              <>Optional category tags (for example, &ldquo;pothole&rdquo;).</>,
              <>
                Basic timing data about how long a report took, which we use to
                improve the app.
              </>,
            ]}
          />
        </Sub>
        <Sub title="Information collected automatically">
          <List
            items={[
              <>
                Device and browser information needed to run and display the
                app.
              </>,
              <>
                Your <strong>IP address</strong>, used only momentarily to
                rate-limit our AI service and prevent abuse.{" "}
                <strong>
                  We do not store your IP address in our database.
                </strong>
              </>,
              <>
                Error and diagnostic logs, processed by our error-reporting
                provider (see <em>How we share information</em>).
              </>,
            ]}
          />
        </Sub>
      </Section>

      <Section id="photos" n={2} title="How we handle your photos">
        <P>
          Photos get special handling because they can capture people and
          license plates. Here is exactly what happens to a photo you submit:
        </P>
        <List
          items={[
            <>
              Before any public sharing, your device attempts to{" "}
              <strong>blur faces and license plates</strong>, creating a blurred
              copy on your phone.
            </>,
            <>
              The <strong>blurred copy</strong> is stored on a public
              content-delivery network and may be displayed publicly, on city
              maps, in issue feeds, and to other residents, as part of the
              report.
            </>,
            <>
              The <strong>original, unblurred photo</strong> is uploaded to
              private storage that only authorized city staff can access, and is{" "}
              <strong>automatically deleted after 30 days</strong>.
            </>,
            <>
              The original, unblurred photo is also{" "}
              <strong>sent to our AI provider (Google)</strong> to classify the
              issue (see <em>Automated classification</em> below).
            </>,
          ]}
        />
        <Callout
          tone="info"
          title="Blurred photos may be public, and stay public"
        >
          <P>
            Once a blurred photo is part of a report, it may remain publicly
            accessible indefinitely. Treat anything visible in a submitted photo
            as potentially public and permanent.
          </P>
        </Callout>
        <Callout tone="warn" title="Important limitation of automatic blurring">
          <P>
            Automatic blurring relies on a feature available only in some web
            browsers. Where it isn&rsquo;t available, the app falls back to
            blurring the top and bottom portions of the image, which may not
            cover a person centered in the frame. Because blurring is{" "}
            <strong>not guaranteed</strong>, please avoid photographing
            identifiable people, bystanders, or readable license plates, capture
            only the infrastructure issue itself.
          </P>
        </Callout>
      </Section>

      <Section id="ai" n={3} title="Automated classification (AI)">
        <P>
          Civic uses Google&rsquo;s Gemini AI model to look at your submitted
          photo and predict the type of issue (for example,
          &ldquo;pothole&rdquo;), its likely severity, and whether it may be an
          emergency. This helps route your report to the right city crew.
        </P>
        <List
          items={[
            <>
              The unblurred original image is <strong>sent to Google</strong>,
              which processes it as our service provider.
            </>,
            <>
              The model&rsquo;s output is a{" "}
              <strong>prediction and can be wrong</strong>. An incorrect or
              low-confidence classification does not change your rights, and
              city staff review reports before acting.
            </>,
            <>
              You can ask us to <strong>review or correct</strong> an automated
              classification of your report by contacting us.
            </>,
          ]}
        />
      </Section>

      <Section id="use" n={4} title="How we use your information">
        <List
          items={[
            <>Provide and operate Civic.</>,
            <>Classify reports and route them to the responsible city.</>,
            <>Detect duplicate or related reports and merge them.</>,
            <>Notify you of status updates on your reports.</>,
            <>Maintain safety and prevent abuse, fraud, and spam.</>,
            <>Debug, secure, and improve the app.</>,
            <>Comply with legal obligations.</>,
          ]}
        />
      </Section>

      <Section id="cookies" n={5} title="Cookies and local storage">
        <P>
          Civic uses essential cookies and on-device storage to function. We do
          not use them for advertising.
        </P>
        <List
          items={[
            <>
              <strong>Authentication cookies and browser local storage</strong>{" "}
              that keep you signed in, set by our auth provider (Supabase).
            </>,
            <>
              A <strong>service-worker cache</strong> that stores app files on
              your device so Civic loads quickly and works as a progressive web
              app.
            </>,
          ]}
        />
        <P>
          We do not use third-party advertising or cross-site tracking cookies.
        </P>
      </Section>

      <Section id="share" n={6} title="How we share information">
        <Sub title="Service providers (sub-processors)">
          <P>
            We share information with vendors who process it on our behalf,
            under contract, only to run Civic:
          </P>
          <List
            items={[
              <>
                <strong>Supabase</strong>, database, file storage, and
                authentication.
              </>,
              <>
                <strong>Google</strong>, AI classification of report photos
                (Gemini).
              </>,
              <>
                <strong>Sentry</strong>, error and crash reporting. Error logs
                may include a report&rsquo;s ID and technical details.
              </>,
              <>
                <strong>Map providers</strong> (OpenStreetMap, CartoDB, ArcGIS),
                map tiles. Maps render in your browser; we do not send your
                account details to these providers.
              </>,
              <>Our hosting provider, which runs the app.</>,
            ]}
          />
        </Sub>
        <Sub title="Cities and government systems">
          <List
            items={[
              <>
                Reports, including the{" "}
                <strong>
                  blurred photo, location, description, and classification
                </strong>{" "}
                . Are shared with the city responsible for the area so it can
                act on the issue.
              </>,
              <>
                Some cities receive reports through the <strong>Open311</strong>{" "}
                open standard used by government systems. Once a report is in a
                city&rsquo;s system, it may become part of that
                government&rsquo;s records, including{" "}
                <strong>public records</strong> subject to disclosure law.
              </>,
            ]}
          />
        </Sub>
        <Sub title="Public display">
          <P>
            The blurred photo, approximate location, description, tags, and
            status of a report may be shown publicly on maps and feeds within
            Civic.
          </P>
        </Sub>
        <Sub title="Legal and safety">
          <P>
            We may disclose information if required by law or to protect the
            rights, safety, or property of users, the public, or Civic.
          </P>
        </Sub>
        <Callout tone="info" title="We do not sell your data">
          <P>
            We do not sell your personal information or share it for
            cross-context behavioral advertising, as those terms are defined
            under the California Consumer Privacy Act (CCPA). Sending a photo to
            Google to classify your report is processing by a service provider,
            not a sale.
          </P>
        </Callout>
      </Section>

      <Section id="retention" n={7} title="How long we keep information">
        <List
          items={[
            <>
              <strong>Original (unblurred) photos</strong>, automatically
              deleted after 30 days.
            </>,
            <>
              <strong>Blurred photos</strong>, kept as part of the public report
              record and may remain available indefinitely.
            </>,
            <>
              <strong>Reports, classifications, and your account</strong>, kept
              while your account or the report is active, and as needed to
              provide the service, resolve issues, and meet legal obligations.
            </>,
            <>
              <strong>IP addresses</strong>, not stored (used only in-memory for
              rate limiting).
            </>,
            <>
              <strong>Error logs</strong>, retained by us and Sentry for a
              limited period to debug problems.
            </>,
          ]}
        />
      </Section>

      <Section id="rights" n={8} title="Your choices and rights">
        <P>
          Depending on where you live, you may have some or all of the following
          rights. To exercise any of them, contact us at {CONTACT}.
        </P>
        <List
          items={[
            <>
              <strong>Access</strong>, request a copy of the personal
              information we hold about you.
            </>,
            <>
              <strong>Correction</strong>. Ask us to fix inaccurate information.
            </>,
            <>
              <strong>Deletion</strong>. Ask us to delete your account and
              personal information, subject to records a city may already hold
              or that we must keep by law.
            </>,
            <>
              <strong>Location</strong>, allow or deny location access in your
              browser or device settings at any time.
            </>,
            <>
              <strong>Photos</strong>. You choose what to photograph; avoid
              capturing people or readable plates.
            </>,
          ]}
        />
        <Sub title="California residents (CCPA)">
          <P>
            If you are a California resident, you have the right to know what
            personal information we collect, to request deletion, to opt out of
            &ldquo;sale&rdquo; or &ldquo;sharing&rdquo; (we do neither), and not
            to be discriminated against for exercising these rights. Submit a
            request to {CONTACT}.
          </P>
        </Sub>
      </Section>

      <Section id="security" n={9} title="Security">
        <P>
          We protect information with encryption in transit, access controls,
          and database row-level security that limits each user to their own
          data and restricts unblurred photos to authorized staff. No system is
          perfectly secure, and we cannot guarantee absolute security.
        </P>
      </Section>

      <Section id="children" n={10} title="Children's privacy">
        <P>
          Civic is not directed to children under 13, and we do not knowingly
          collect personal information from them. If you believe a child has
          provided us information, contact us and we will delete it.
        </P>
      </Section>

      <Section id="international" n={11} title="International users">
        <P>
          Civic is operated from, and stores data in, the United States, and our
          providers (such as Google and Supabase) may process data in the United
          States and other countries. By using Civic, you understand your
          information may be processed in the U.S.
        </P>
      </Section>

      <Section id="changes" n={12} title="Changes to this policy">
        <P>
          We may update this Privacy Policy. We&rsquo;ll change the &ldquo;Last
          updated&rdquo; date above, and significant changes may be highlighted
          in the app. Continued use after an update means you accept the revised
          policy.
        </P>
      </Section>

      <Section id="contact" n={13} title="Contact">
        <P>
          Questions or requests? Contact {ORG} at {CONTACT}.
        </P>
      </Section>
    </LegalShell>
  );
}
