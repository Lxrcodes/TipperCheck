import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

export function TermsPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-slate-900">
      <div className="max-w-3xl mx-auto px-4 py-8">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-slate-400 hover:text-white mb-8 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>

        <div className="prose prose-invert max-w-none">
          <h1 className="text-3xl font-bold text-white mb-2">Terms and Conditions</h1>
          <p className="text-slate-400 mb-8">Last updated: 21 May 2026</p>

          <div className="space-y-8 text-slate-300">
            <p>
              These Terms and Conditions ("Terms") govern your use of the CheckaTruck platform ("Service"), operated
              by TIPPER CONNECT LIMITED, a company registered in England and Wales under company number 17022663
              ("we", "us", "our").
            </p>
            <p>
              By creating an account or using the Service, you agree to be bound by these Terms. If you do not
              agree, you must not use the Service.
            </p>

            <section>
              <h2 className="text-xl font-bold text-white mb-4">1. The Service</h2>
              <p className="mb-3">
                CheckaTruck provides a digital vehicle walkaround check platform designed to help operators comply
                with DVSA daily vehicle check requirements. The Service includes guided digital checklists, defect
                reporting, photo evidence capture, a fleet management dashboard, and an offline-capable Progressive
                Web App (PWA).
              </p>
              <p>
                We reserve the right to modify, suspend, or discontinue any part of the Service at any time with
                reasonable notice.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-white mb-4">2. Eligibility and Accounts</h2>
              <p className="mb-3">
                You must be at least 18 years old and have authority to enter into a binding contract on behalf of
                your organisation to use this Service.
              </p>
              <p className="mb-2">You are responsible for:</p>
              <ul className="list-disc pl-6 space-y-1">
                <li>Maintaining the confidentiality of your account credentials</li>
                <li>All activity that occurs under your account</li>
                <li>Ensuring that all users you add to your account comply with these Terms</li>
                <li>Providing accurate and up-to-date information during registration</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-bold text-white mb-4">3. Free Trial</h2>
              <p>
                To start your free trial, you will be required to provide valid payment details. You will not be
                charged during the trial period. If you do not cancel before the trial period ends, your
                subscription will automatically begin and your payment method will be charged at the applicable rate.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-white mb-4">4. Pricing and Payment</h2>
              <p className="mb-3">
                The Service is charged at 70p per vehicle per week plus VAT, billed yearly. Pricing may be subject
                to change with 30 days' notice.
              </p>
              <p className="mb-3">
                All fees are non-refundable unless otherwise required by law. You are responsible for any applicable
                taxes in your jurisdiction.
              </p>
              <p>
                We use a third-party payment processor to handle billing. By providing payment details, you
                authorise us to charge the applicable fees to your chosen payment method.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-white mb-4">5. Acceptable Use</h2>
              <p className="mb-3">
                You agree to use the Service only for lawful purposes and in accordance with these Terms. You must not:
              </p>
              <ul className="list-disc pl-6 space-y-1">
                <li>Use the Service to store or transmit any unlawful, harmful, or fraudulent content</li>
                <li>Attempt to gain unauthorised access to any part of the Service or its related systems</li>
                <li>Reverse engineer, decompile, or attempt to extract the source code of the Service</li>
                <li>Use the Service in any way that could damage, disable, or impair the platform</li>
                <li>Resell or sublicense access to the Service without our written consent</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-bold text-white mb-4">6. DVSA Compliance</h2>
              <p>
                CheckaTruck is designed to support DVSA walkaround check compliance. However, we do not guarantee
                that use of the Service will ensure full legal compliance in all circumstances. You remain solely
                responsible for ensuring your operations meet all applicable legal and regulatory requirements,
                including but not limited to those set by the DVSA, DVLA, and any other relevant authority.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-white mb-4">7. Data and Content</h2>
              <p className="mb-3">
                You retain ownership of all data, photos, and content you upload to the Service ("Your Content").
                By uploading content, you grant us a limited licence to store, process, and display it solely for
                the purpose of providing the Service to you.
              </p>
              <p className="mb-3">
                You are responsible for ensuring you have the right to upload any content and that it does not
                infringe any third-party rights.
              </p>
              <p>
                We take reasonable technical and organisational measures to protect Your Content. However, we
                recommend you maintain your own backups of critical compliance records.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-white mb-4">8. Intellectual Property</h2>
              <p>
                All intellectual property rights in the Service, including but not limited to software, design,
                trademarks, and documentation, are owned by or licensed to TIPPER CONNECT LIMITED. Nothing in
                these Terms grants you any rights in the Service other than as necessary to use it in accordance
                with these Terms.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-white mb-4">9. Limitation of Liability</h2>
              <p className="mb-3">To the fullest extent permitted by applicable law:</p>
              <ul className="list-disc pl-6 space-y-1 mb-4">
                <li>We shall not be liable for any indirect, incidental, special, consequential, or punitive damages</li>
                <li>Our total liability to you for any claim arising out of or relating to these Terms or the Service shall not exceed the fees paid by you in the 3 months preceding the claim</li>
                <li>We make no warranties, express or implied, regarding the Service, including warranties of merchantability, fitness for a particular purpose, or non-infringement</li>
              </ul>
              <p>
                Nothing in these Terms excludes or limits liability for death or personal injury caused by
                negligence, fraud, or any other liability that cannot be excluded by law.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-white mb-4">10. Termination</h2>
              <p className="mb-3">
                You may cancel your account at any time via your account settings or by contacting us. Cancellation
                takes effect at the end of your current billing period.
              </p>
              <p className="mb-3">
                We may suspend or terminate your account immediately if you breach these Terms, fail to pay
                applicable fees, or if we are required to do so by law.
              </p>
              <p>
                Upon termination, your access to the Service will cease. We will retain your data for 90 days
                following termination, after which it will be deleted, unless we are required to retain it for
                legal reasons.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-white mb-4">11. Governing Law</h2>
              <p>
                These Terms are governed by and construed in accordance with the laws of England and Wales. Any
                disputes arising from these Terms or your use of the Service shall be subject to the exclusive
                jurisdiction of the courts of England and Wales.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-white mb-4">12. Changes to These Terms</h2>
              <p>
                We may update these Terms from time to time. We will notify you of material changes by email or
                via a notice in the Service. Your continued use of the Service after the effective date of any
                changes constitutes your acceptance of the revised Terms.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-white mb-4">13. Contact Us</h2>
              <p className="mb-2">If you have any questions about these Terms, please contact us at:</p>
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
