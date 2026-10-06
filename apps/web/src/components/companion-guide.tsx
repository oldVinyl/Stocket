import { ArrowUpRight, Download, Smartphone } from "lucide-react";

export default function CompanionGuide() {
  const androidUrl =
    process.env.NEXT_PUBLIC_ANDROID_DOWNLOAD_URL ||
    "https://github.com/oldVinyl";
  return (
    <div className="companion-guide">
      <p>
        The same workspace, wherever your day takes you. Sign in with your
        company email to see your team’s stock.
      </p>
      <section className="guide-panel">
        <h3>
          <Download size={20} /> On Android
        </h3>
        <p>
          Get the Stocket APK from our GitHub page. When a release is available,
          open its Assets section and download the .apk file.
        </p>
        <a
          className="button primary"
          href={androidUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          Get Stocket on GitHub <ArrowUpRight size={17} />
        </a>
        <p className="guide-note">
          If Android asks, allow your browser to install this app, then open the
          downloaded APK. Only install the file from our linked GitHub page.
        </p>
      </section>
      <section className="guide-panel">
        <h3>
          <Smartphone size={20} /> On iPhone or iPad
        </h3>
        <ol>
          <li>
            Open this Stocket website in <strong>Safari</strong> on your phone.
          </li>
          <li>
            Tap <strong>Share</strong> (the square with an upward arrow). It may
            be inside the More menu.
          </li>
          <li>
            Choose <strong>Add to Home Screen</strong>. Turn on{" "}
            <strong>Open as Web App</strong> if offered, then tap{" "}
            <strong>Add</strong>.
          </li>
          <li>
            Open Stocket from your Home Screen and sign in with your company
            email.
          </li>
        </ol>
        <p className="guide-note">
          Use your hosted Stocket address on your phone; localhost is only
          available on the computer running it. Keep using the same address so
          your saved offline stock stays in one place.
        </p>
      </section>
    </div>
  );
}
