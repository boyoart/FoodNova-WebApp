import './InfoPages.css'

export default function PrivacyPolicy() {
  return (
    <div className="info-page">
      <div className="info-container">
        <h1>Privacy Policy</h1>
        <div className="content">
          <h2>Introduction</h2>
          <p>
            FoodNova ("we", "our", or "us") operates the website. This page informs you of our
            policies regarding the collection, use, and disclosure of personal data when you use our
            service and the choices you have associated with that data.
          </p>

          <h2>Information Collection and Use</h2>
          <p>We collect several different types of information for various purposes:</p>
          <ul>
            <li>Personal Data: Email, name, phone number, delivery address</li>
            <li>Usage Data: Browser type, IP address, pages visited, time spent</li>
            <li>Payment Information: Bank transfer details (processed securely)</li>
          </ul>

          <h2>Optional website analytics</h2>
          <p>When configured, we use Google Analytics 4 only after you accept analytics in Privacy choices. Rejecting it does not affect shopping. You can withdraw your choice at any time using that control. We remember your preference for up to 180 days.</p>
          <p>With consent, Google receives a pseudonymous cookie identifier, public page visits, product identifiers, shopping events, browser/device information and approximate country/city. Your network address is necessarily visible to Google when requests are sent; FoodNova does not store visitor IP addresses for this module or display individual visitor locations. We exclude names, emails, phone numbers, addresses, account pages, URL query strings and free-text searches. Advertising personalization and Google signals are disabled by this integration.</p>
          <p>For signed-in customers who revisit My Orders with consent, we may report a confirmed payment using a non-personal transaction reference. We do not send your customer profile or join browsing history to your identity. This measurement may miss offline payments or visits where consent is declined, and is separate from our financial records. Google processes analytics data on its infrastructure, which may be outside Nigeria. See <a href="https://policies.google.com/privacy" target="_blank" rel="noreferrer">Google’s privacy policy</a>. Contact us to ask about analytics retention or your privacy rights.</p>
          <h2>Secure order tracking links</h2>
          <p>When enabled, an order number alone does not authorize guest tracking. We send a private, expiring link to the email used for the order. It permits only general fulfilment progress; private details require signing in as the order owner. We store a hash of the link token, its expiry and order association, and short-lived hashed abuse-limit identifiers. Do not share your link. You can ask support to revoke it.</p>
          <h2>Security of Data</h2>
          <p>
            The security of your data is important to us, but remember that no method of transmission
            over the Internet is 100% secure. While we strive to use commercially acceptable means to
            protect your Personal Data, we cannot guarantee its absolute security.
          </p>

          <h2>Changes to This Privacy Policy</h2>
          <p>
            We may update our Privacy Policy from time to time. We will notify you of any changes by
            posting the new Privacy Policy on this page.
          </p>

          <h2>Contact Us</h2>
          <p>
            If you have any questions about this Privacy Policy, please contact us at:
            <br />
            privacy@foodnova.com
          </p>
        </div>
      </div>
    </div>
  )
}
