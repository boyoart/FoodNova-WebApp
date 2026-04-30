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
