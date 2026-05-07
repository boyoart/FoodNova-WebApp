import { Link } from 'react-router-dom'
import { FOODNOVA_CONTACT } from '../utils/contactUtils'
import './InfoPages.css'

export default function TermsPage() {
  return (
    <div className="info-page">
      <div className="info-container">
        <h1>Terms of Service</h1>
        <div className="content">
          <h2>Acceptance of Terms</h2>
          <p>
            By accessing and using the FoodNova website, you accept and agree to be bound by the
            terms and provision of this agreement.
          </p>

          <h2>Use License</h2>
          <p>
            Permission is granted to temporarily download one copy of the materials (information or
            software) on FoodNova for personal, non-commercial transitory viewing only. This is the
            grant of a license, not a transfer of title, and under this license you may not:
          </p>
          <ul>
            <li>Modify or copy the materials</li>
            <li>Use the materials for any commercial purpose or for any public display</li>
            <li>Attempt to decompile or reverse engineer any software contained on the website</li>
            <li>Remove any copyright or other proprietary notations from the materials</li>
            <li>Transmit the materials to anyone or any place</li>
          </ul>

          <h2>Disclaimer</h2>
          <p>
            The materials on FoodNova are provided on an 'as is' basis. FoodNova makes no warranties,
            expressed or implied, and hereby disclaims and negates all other warranties including,
            without limitation, implied warranties or conditions of merchantability, fitness for a
            particular purpose, or non-infringement of intellectual property.
          </p>

          <h2>Limitations</h2>
          <p>
            In no event shall FoodNova or its suppliers be liable for any damages (including, without
            limitation, damages for loss of data or profit, or due to business interruption) arising
            out of the use or inability to use the materials on the FoodNova website.
          </p>

          <h2>Accuracy of Materials</h2>
          <p>
            The materials appearing on FoodNova could include technical, typographical, or photographic
            errors. FoodNova does not warrant that any of the materials on its website are accurate,
            complete, or current.
          </p>

          <h2>Links</h2>
          <p>
            FoodNova has not reviewed all of the sites linked to its website and is not responsible for
            the contents of any such linked site. The inclusion of any link does not imply endorsement
            by FoodNova of the site. Use of any such linked website is at the user's own risk.
          </p>

          <h2>Modifications</h2>
          <p>
            FoodNova may revise these terms of service at any time without notice. By using this website,
            you are agreeing to be bound by the then current version of these terms of service.
          </p>

          <h2>Customer Policies</h2>
          <p>
            Customers should review the <Link to="/policies">FoodNova Customer Policies</Link> for
            payment, delivery, cancellation, refund request, and support rules that apply to orders.
          </p>

          <h2>Contact</h2>
          <p>
            If you have any questions about these Terms of Service, please contact us at:
            <br />
            {FOODNOVA_CONTACT.email}
          </p>
        </div>
      </div>
    </div>
  )
}
