// Privacy Policy + Terms & Conditions for BizCheck Kenya.
// NOTE: drafted to reflect how the app actually works (credits,
// M-Pesa, ID verification, bans). Have a Kenyan advocate review
// before major scale — especially Data Protection Act compliance.

const wrap = { maxWidth: 760, margin: '0 auto', padding: '32px 20px', lineHeight: 1.7, color: 'var(--text)' }
const h2s = { fontSize: 17, marginTop: 28, marginBottom: 8, color: 'var(--text-strong)' }
const ps = { fontSize: 14, marginBottom: 10 }

export function PrivacyPolicy({ onBack }) {
  return (
    <div style={wrap}>
      {onBack && <button className="link-btn" onClick={onBack}>← Back</button>}
      <h1 style={{ fontSize: 24, marginBottom: 4 }}>Privacy Policy</h1>
      <p className="muted" style={{ fontSize: 13, marginBottom: 20 }}>Last updated: July 2026 · BizCheck Kenya ("BizCheck", "we", "us")</p>

      <p style={ps}>BizCheck Kenya helps Kenyans verify online sellers and report scams. This policy explains what personal data we collect, why, and the choices you have. We aim to comply with the Kenya Data Protection Act, 2019.</p>

      <h2 style={h2s}>1. Information we collect</h2>
      <p style={ps}><strong>Account data:</strong> name, email address, username, phone number, and an optional profile picture.</p>
      <p style={ps}><strong>Business verification data:</strong> if you register a business, we collect your official name, national ID number, age, contact details, and photos of your national ID, business permit, and registration documents. These are used solely to verify that businesses on BizCheck are operated by real, identifiable people.</p>
      <p style={ps}><strong>Payments:</strong> when you buy credits or subscribe, payments are processed by Safaricom M-Pesa. We store your phone number, the amount, and the transaction reference. We never see or store your M-Pesa PIN.</p>
      <p style={ps}><strong>Content and activity:</strong> reviews, reports, votes, messages you send on the platform, businesses you view, and enforcement history (warnings or restrictions on your account).</p>

      <h2 style={h2s}>2. How we use it</h2>
      <p style={ps}>To operate the service: verifying businesses, calculating trust scores, showing reviews, delivering messages, processing payments, and preventing fraud and abuse (including detecting spam and enforcing bans). We also use contact details to send service emails such as verification codes and business codes.</p>

      <h2 style={h2s}>3. What is visible to others</h2>
      <p style={ps}>Your username, profile picture, reviews, and votes are visible to other users. Verified business listings — including business name, category, location, contact details, and trust score — are public. Your national ID details and uploaded documents are <strong>never</strong> public; they are visible only to vetted BizCheck administrators for verification purposes. Business-to-business messages can be viewed by the platform superadmin for safety oversight.</p>

      <h2 style={h2s}>4. Data sharing</h2>
      <p style={ps}>We do not sell your personal data. We share data only with service providers required to run BizCheck (hosting, database, email delivery, and Safaricom for payments), and with authorities where Kenyan law requires it — for example, in fraud investigations.</p>

      <h2 style={h2s}>5. Retention and bans</h2>
      <p style={ps}>We keep account data while your account is active. Records of banned businesses — including the business name and reason for the ban — are retained and displayed publicly to protect other users. Reports are retained even when cancelled, marked accordingly.</p>

      <h2 style={h2s}>6. Your rights</h2>
      <p style={ps}>Under the Data Protection Act you may request access to, correction of, or deletion of your personal data, subject to our legal obligations to retain fraud-related records. Contact us through the in-app Support chat to exercise these rights.</p>

      <h2 style={h2s}>7. Security</h2>
      <p style={ps}>Data is protected with encrypted connections, row-level database access controls, masked credential entry, rate limiting, and brute-force lockouts. Verification documents are stored in private storage accessible only to authorised administrators.</p>

      <h2 style={h2s}>8. Children</h2>
      <p style={ps}>BizCheck is not intended for anyone under 18. Business registration requires confirming you are 18 or older.</p>

      <h2 style={h2s}>9. Changes</h2>
      <p style={ps}>We may update this policy as BizCheck evolves. Material changes will be announced in the app's Notifications.</p>
    </div>
  )
}

export function TermsAndConditions({ onBack }) {
  return (
    <div style={wrap}>
      {onBack && <button className="link-btn" onClick={onBack}>← Back</button>}
      <h1 style={{ fontSize: 24, marginBottom: 4 }}>Terms &amp; Conditions</h1>
      <p className="muted" style={{ fontSize: 13, marginBottom: 20 }}>Last updated: July 2026 · BizCheck Kenya</p>

      <p style={ps}>By creating an account or using BizCheck Kenya, you agree to these terms.</p>

      <h2 style={h2s}>1. What BizCheck is — and isn't</h2>
      <p style={ps}>BizCheck is a community-driven platform for checking and reporting online sellers. Trust scores, reviews, and verification badges are informational tools based on community input and document checks — they are <strong>not a guarantee</strong> that any transaction will be safe. You transact with businesses at your own risk, and BizCheck is not a party to, or liable for, transactions between users and businesses.</p>

      <h2 style={h2s}>2. Accounts</h2>
      <p style={ps}>You must be 18 or older, provide accurate information, and keep your login credentials, business codes, and admin codes confidential. You are responsible for activity on your account.</p>

      <h2 style={h2s}>3. Credits and subscriptions</h2>
      <p style={ps}>Certain actions consume credits, and subscriptions unlock unlimited use for their duration. Credits and subscription fees are charged in Kenyan Shillings via M-Pesa. Credits have no cash value, are non-transferable, and are not refundable once consumed. Subscription periods run from payment confirmation; pricing is shown on the Pricing page and may change with notice. If a business plan payment lapses, premium features are restricted until payment resumes.</p>

      <h2 style={h2s}>4. Business verification</h2>
      <p style={ps}>Registering a business requires submitting genuine identity and business documents and paying the applicable listing fee. Submitting forged or misleading documents is grounds for permanent removal. Verification reflects a document check at a point in time and does not make BizCheck responsible for a business's future conduct.</p>

      <h2 style={h2s}>5. Community conduct</h2>
      <p style={ps}>You agree not to: post false reviews or reports; harass, threaten, or abuse others in reviews or messages; spam businesses with repeated actions; attempt to bypass credit charges, rate limits, or security controls; or register businesses using details tied to previously banned businesses.</p>

      <h2 style={h2s}>6. Enforcement</h2>
      <p style={ps}>Violations may result in escalating action: warnings (temporary loss of voting/review rights), restrictions (extended loss of review rights), or permanent account bans with account deletion. Businesses may be banned with the reason displayed publicly. Reports you file may be reviewed, kept, or cancelled by administrators; cancelled reports remain on record marked as cancelled.</p>

      <h2 style={h2s}>7. Content</h2>
      <p style={ps}>You retain ownership of content you post but grant BizCheck a licence to display it as part of the service. We may remove content that violates these terms.</p>

      <h2 style={h2s}>8. Liability</h2>
      <p style={ps}>To the maximum extent permitted by Kenyan law, BizCheck is provided "as is" and we are not liable for losses arising from transactions with listed businesses, user content, service interruptions, or actions taken in good faith to enforce these terms.</p>

      <h2 style={h2s}>9. Governing law</h2>
      <p style={ps}>These terms are governed by the laws of Kenya. Disputes are subject to the jurisdiction of Kenyan courts.</p>

      <h2 style={h2s}>10. Contact</h2>
      <p style={ps}>Questions about these terms or this service: use the in-app Support chat.</p>
    </div>
  )
}
