import { ArrowLeft } from 'lucide-react';

export function PrivacyPage() {
  const handleBack = () => {
    if (window.history.length > 1) {
      window.history.back();
    } else {
      window.close();
    }
  };

  return (
    <div className="min-h-screen bg-slate-900">
      <div className="max-w-3xl mx-auto px-4 py-8">
        <button
          onClick={handleBack}
          className="flex items-center gap-2 text-slate-400 hover:text-white mb-8 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>

        <div className="prose prose-invert max-w-none">
          <h1 className="text-3xl font-bold text-white mb-2">Privacy Policy</h1>
          <p className="text-slate-400 mb-8">Last updated: 21 May 2026</p>

          <div className="space-y-8 text-slate-300">
            <p>
              This Privacy Policy explains how TIPPER CONNECT LIMITED (company number 17022663) collects, uses, and
              protects your personal data when you use the CheckaTruck platform ("Service"). We are committed to
              protecting your privacy and complying with the UK General Data Protection Regulation (UK GDPR) and the
              Data Protection Act 2018.
            </p>
            <p>We are the data controller for personal data processed through the Service.</p>

            <section>
              <h2 className="text-xl font-bold text-white mb-4">1. Data We Collect</h2>
              <h3 className="font-semibold text-white mb-2">Account and contact information</h3>
              <ul className="list-disc pl-6 space-y-1 mb-4">
                <li>Name and email address</li>
                <li>Company name and contact details</li>
                <li>Billing information (handled by our payment processor — we do not store card details)</li>
              </ul>
              <h3 className="font-semibold text-white mb-2">Vehicle and operational data</h3>
              <ul className="list-disc pl-6 space-y-1 mb-4">
                <li>Vehicle registration numbers and details</li>
                <li>Daily check records and inspection results</li>
                <li>Defect reports and their status</li>
                <li>Timestamps and location data associated with checks (if enabled)</li>
              </ul>
              <h3 className="font-semibold text-white mb-2">Driver data</h3>
              <ul className="list-disc pl-6 space-y-1 mb-4">
                <li>Driver names linked to completed checks</li>
                <li>Photos captured during walkaround checks</li>
                <li>Device information used to complete checks</li>
              </ul>
              <h3 className="font-semibold text-white mb-2">Usage data</h3>
              <ul className="list-disc pl-6 space-y-1">
                <li>Log data including IP addresses and browser type</li>
                <li>Pages visited and features used within the Service</li>
                <li>Error logs and performance data</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-bold text-white mb-4">2. How We Use Your Data</h2>
              <p className="mb-3">We process your personal data for the following purposes:</p>
              <ul className="list-disc pl-6 space-y-1 mb-4">
                <li>To provide, operate, and maintain the Service</li>
                <li>To manage your account and process payments</li>
                <li>To generate compliance records and audit trails</li>
                <li>To send service-related communications such as check reminders and defect alerts</li>
                <li>To improve and develop the Service</li>
                <li>To comply with our legal obligations</li>
              </ul>
              <h3 className="font-semibold text-white mb-2">Legal bases for processing (UK GDPR)</h3>
              <ul className="list-disc pl-6 space-y-1">
                <li><strong className="text-white">Contract:</strong> processing necessary to perform the contract we have with you</li>
                <li><strong className="text-white">Legitimate interests:</strong> improving the Service, fraud prevention, and security</li>
                <li><strong className="text-white">Legal obligation:</strong> retaining records as required by applicable law</li>
                <li><strong className="text-white">Consent:</strong> where you have given explicit consent (e.g. marketing communications)</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-bold text-white mb-4">3. Data Storage and International Transfers</h2>
              <p className="mb-3">
                Your data is stored using Supabase, which operates on Amazon Web Services (AWS) infrastructure. This
                means your data may be stored and processed outside the United Kingdom, including in the United States.
              </p>
              <p>
                Where we transfer personal data outside the UK, we ensure appropriate safeguards are in place in
                accordance with UK GDPR, including reliance on the UK adequacy regulations or standard contractual
                clauses as appropriate.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-white mb-4">4. Data Retention</h2>
              <p className="mb-3">
                We retain your personal data for as long as your account is active or as necessary to provide the
                Service. Specifically:
              </p>
              <ul className="list-disc pl-6 space-y-1">
                <li>Account data is retained for the duration of your subscription</li>
                <li>Check records and compliance data are retained for a minimum of 15 months in line with DVSA guidance</li>
                <li>Upon account termination, data is retained for 90 days before deletion, unless we are legally required to retain it longer</li>
                <li>Payment records are retained for 7 years in line with HMRC requirements</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-bold text-white mb-4">5. Sharing Your Data</h2>
              <p className="mb-3">We do not sell your personal data. We may share data with:</p>
              <ul className="list-disc pl-6 space-y-1">
                <li><strong className="text-white">Supabase (AWS):</strong> for data storage and infrastructure</li>
                <li><strong className="text-white">Payment processors:</strong> to handle billing securely</li>
                <li><strong className="text-white">Professional advisors:</strong> such as lawyers or accountants where necessary</li>
                <li><strong className="text-white">Law enforcement or regulatory bodies:</strong> where required by law</li>
              </ul>
              <p className="mt-3">All third-party processors are bound by data processing agreements that require them to protect your data.</p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-white mb-4">6. Your Rights</h2>
              <p className="mb-3">Under UK GDPR, you have the following rights regarding your personal data:</p>
              <ul className="list-disc pl-6 space-y-1">
                <li><strong className="text-white">Right of access:</strong> to request a copy of the data we hold about you</li>
                <li><strong className="text-white">Right to rectification:</strong> to correct inaccurate or incomplete data</li>
                <li><strong className="text-white">Right to erasure:</strong> to request deletion of your data in certain circumstances</li>
                <li><strong className="text-white">Right to restrict processing:</strong> to limit how we use your data</li>
                <li><strong className="text-white">Right to data portability:</strong> to receive your data in a structured, machine-readable format</li>
                <li><strong className="text-white">Right to object:</strong> to object to processing based on legitimate interests</li>
                <li><strong className="text-white">Rights related to automated decision-making:</strong> we do not make solely automated decisions that significantly affect you</li>
              </ul>
              <p className="mt-3">To exercise any of these rights, please contact us using the details below. We will respond within one month of receiving your request.</p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-white mb-4">7. Cookies</h2>
              <p>
                The Service uses essential cookies to maintain your session and ensure the platform functions correctly.
                We do not use advertising or tracking cookies. You can control cookies through your browser settings,
                though disabling essential cookies may affect the functionality of the Service.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-white mb-4">8. Security</h2>
              <p className="mb-3">
                We implement appropriate technical and organisational measures to protect your personal data against
                unauthorised access, loss, or disclosure. These include encrypted data transmission (HTTPS), access
                controls, and regular security reviews.
              </p>
              <p>
                In the event of a data breach that is likely to affect your rights and freedoms, we will notify you
                and the Information Commissioner's Office (ICO) in accordance with our legal obligations.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-white mb-4">9. Children's Data</h2>
              <p>
                The Service is not directed at children under the age of 18. We do not knowingly collect personal data
                from children. If you believe we have inadvertently collected such data, please contact us immediately.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-white mb-4">10. Changes to This Policy</h2>
              <p>
                We may update this Privacy Policy from time to time. We will notify you of material changes by email
                or via a notice within the Service. The date at the top of this policy indicates when it was last updated.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-white mb-4">11. Complaints</h2>
              <p className="mb-3">
                If you have concerns about how we handle your personal data, you have the right to lodge a complaint
                with the Information Commissioner's Office (ICO):
              </p>
              <ul className="list-disc pl-6 space-y-1 mb-3">
                <li>Website: <a href="https://ico.org.uk" className="text-orange-400 hover:text-orange-300">ico.org.uk</a></li>
                <li>Helpline: 0303 123 1113</li>
              </ul>
              <p>
                We would, however, appreciate the opportunity to address your concerns before you contact the ICO,
                so please contact us first.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-white mb-4">12. Contact Us</h2>
              <p className="mb-2">If you have any questions about this Privacy Policy or how we handle your data, please contact us at:</p>
              <p className="font-semibold text-white">TIPPER CONNECT LIMITED</p>
              <p>Email: <a href="mailto:admin@tipperconnect.co.uk" className="text-orange-400 hover:text-orange-300">admin@tipperconnect.co.uk</a></p>
              <p>Website: <a href="https://checkatruck.co.uk" className="text-orange-400 hover:text-orange-300">checkatruck.co.uk</a></p>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
