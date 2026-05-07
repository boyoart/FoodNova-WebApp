import { HelpCircle } from 'lucide-react'
import { FOODNOVA_CONTACT } from '../utils/contactUtils'
import './FAQPage.css'

const faqGroups = [
  {
    category: 'Ordering',
    questions: [
      {
        question: 'How do I place an order?',
        answer: 'Browse products or food packs, add items to cart, proceed to checkout, enter delivery details, and place your order.',
      },
      {
        question: 'Do I need an account to order?',
        answer: 'Customers should create or log in to an account so they can track orders, upload receipts, receive notifications, and view invoices.',
      },
      {
        question: 'Can I change my order after placing it?',
        answer: 'If the order has not been processed or dispatched, contact FoodNova quickly through WhatsApp or submit a cancellation/request where available.',
      },
    ],
  },
  {
    category: 'Payment',
    questions: [
      {
        question: 'How do I pay for my order?',
        answer: 'Pay by bank transfer to Account Number: 6427173992, Bank: OPay, Account Name: FOODNOVA LIMITED.',
      },
      {
        question: 'What should I use as payment narration?',
        answer: 'Use your FoodNova order code, for example FN-00001, as the payment narration/reference.',
      },
      {
        question: 'What happens after I upload my receipt?',
        answer: 'FoodNova reviews your receipt. Once confirmed, your payment status will update and you will receive a notification.',
      },
      {
        question: 'Can I upload PDF receipts?',
        answer: 'Yes. FoodNova supports JPG, PNG, WEBP, and PDF receipts.',
      },
    ],
  },
  {
    category: 'Delivery',
    questions: [
      {
        question: 'How does delivery work?',
        answer: 'Once payment is confirmed, FoodNova processes your order and assigns delivery when applicable. You will receive order status updates.',
      },
      {
        question: 'Will I know the delivery rider?',
        answer: 'If a rider is assigned, rider information may appear in your order details.',
      },
      {
        question: 'What is the delivery confirmation code?',
        answer: 'When the order is out for delivery, the dispatch rider provides a delivery confirmation code. Enter the code only after receiving your order.',
      },
      {
        question: 'Should I share the delivery code before receiving my order?',
        answer: 'No. Only enter or share the delivery confirmation code after your order has been received.',
      },
    ],
  },
  {
    category: 'Cancellation / Refund Request',
    questions: [
      {
        question: 'Can I cancel my order?',
        answer: 'You may request cancellation before the order is out for delivery or delivered. FoodNova will review the request.',
      },
      {
        question: 'Can I request a refund?',
        answer: 'Refund requests can be submitted where applicable and will be reviewed by FoodNova. Approval does not mean automatic instant payment reversal.',
      },
      {
        question: 'When can I no longer cancel?',
        answer: 'Cancellation may not be available once the order is out for delivery, delivered, or already completed.',
      },
      {
        question: 'How do I request cancellation/refund?',
        answer: 'Go to Orders, open View Details, and click Request Cancellation / Refund if the order is eligible.',
      },
    ],
  },
  {
    category: 'Account & Profile',
    questions: [
      {
        question: 'Can I save delivery addresses?',
        answer: 'Yes. Customers can save delivery addresses from the profile page for faster checkout.',
      },
      {
        question: 'Can I change my password?',
        answer: 'Yes. Go to Profile and use Account Security to change your password.',
      },
      {
        question: 'Can I upload a profile picture?',
        answer: 'Yes. You can upload an avatar from your profile page.',
      },
    ],
  },
  {
    category: 'Support',
    questions: [
      {
        question: 'How do I contact FoodNova?',
        answer: `Use WhatsApp ${FOODNOVA_CONTACT.phone}, email ${FOODNOVA_CONTACT.email}, or the contact page.`,
      },
      {
        question: 'What should I include when contacting support?',
        answer: 'Include your order code, phone number, and a clear explanation of the issue.',
      },
    ],
  },
]

export default function FAQPage() {
  return (
    <div className="faq-page">
      <section className="faq-hero">
        <div className="faq-hero-icon"><HelpCircle size={28} /></div>
        <h1>Frequently Asked Questions</h1>
        <p>Answers to common FoodNova ordering, payment, delivery, and support questions.</p>
      </section>

      <div className="faq-groups">
        {faqGroups.map((group) => (
          <section className="faq-group" key={group.category}>
            <h2>{group.category}</h2>
            <div className="faq-list">
              {group.questions.map((item) => (
                <details className="faq-item" key={item.question}>
                  <summary>{item.question}</summary>
                  <p>{item.answer}</p>
                </details>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
