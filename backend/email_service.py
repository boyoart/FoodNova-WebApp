from datetime import datetime
from html import escape
import os

try:
    import resend
except Exception:
    resend = None


EMAIL_FROM = os.environ.get("EMAIL_FROM", "FoodNova <support@foodnova.com.ng>")
EMAIL_ENABLED = os.environ.get("EMAIL_ENABLED", "false").strip().lower() in {"1", "true", "yes", "on"}
RESEND_API_KEY = os.environ.get("RESEND_API_KEY")
ADMIN_NOTIFICATION_EMAIL = os.environ.get("ADMIN_NOTIFICATION_EMAIL", "support@foodnova.com.ng")
FRONTEND_URL = os.environ.get("FRONTEND_URL", "https://foodnova.com.ng").rstrip("/")

FOODNOVA_EMAIL = "support@foodnova.com.ng"
FOODNOVA_WEBSITE = "https://foodnova.com.ng"
FOODNOVA_PHONE = "+2348025801125"
FOODNOVA_ADDRESS = "33 Ariyo Akinloye Street, Isheri-Bucknor, Lagos, Nigeria"
FOODNOVA_ACCOUNT_NUMBER = "6427173992"
FOODNOVA_BANK = "OPay"
FOODNOVA_ACCOUNT_NAME = "FOODNOVA LIMITED"


if resend and RESEND_API_KEY:
    resend.api_key = RESEND_API_KEY


def is_email_enabled():
    return bool(EMAIL_ENABLED and RESEND_API_KEY and resend)


def format_naira(amount):
    try:
        value = float(amount or 0)
    except Exception:
        value = 0
    return f"₦{value:,.2f}"


def _order_code(order):
    return order.get("order_code") or (f"FN-{order.get('id')}" if order.get("id") else "N/A")


def _order_items_html(order):
    rows = []
    for item in order.get("items") or []:
        name = escape(str(item.get("product_name") or item.get("name") or item.get("title") or "FoodNova Item"))
        quantity = int(item.get("quantity") or item.get("qty") or 1)
        price = float(item.get("price") or item.get("unit_price") or 0)
        line_total = float(item.get("line_total") or price * quantity)
        rows.append(
            "<tr>"
            f"<td style='padding:10px;border-bottom:1px solid #dde8dd;'>{name}</td>"
            f"<td style='padding:10px;border-bottom:1px solid #dde8dd;text-align:center;'>{quantity}</td>"
            f"<td style='padding:10px;border-bottom:1px solid #dde8dd;text-align:right;'>{format_naira(price)}</td>"
            f"<td style='padding:10px;border-bottom:1px solid #dde8dd;text-align:right;'>{format_naira(line_total)}</td>"
            "</tr>"
        )
    if not rows:
        rows.append("<tr><td colspan='4' style='padding:10px;border-bottom:1px solid #dde8dd;'>Order items unavailable</td></tr>")
    return "".join(rows)


def _order_summary_text(order):
    lines = []
    for item in order.get("items") or []:
        name = item.get("product_name") or item.get("name") or "FoodNova Item"
        quantity = item.get("quantity") or item.get("qty") or 1
        lines.append(f"- {name} x {quantity}")
    return "\n".join(lines) or "Order items unavailable"


def render_order_email_template(order, title, message, cta_text=None, cta_url=None, extra_html=""):
    order_code = escape(str(_order_code(order)))
    customer_name = escape(str(order.get("customer_name") or "FoodNova Customer"))
    total = format_naira(order.get("total_amount") or order.get("total") or 0)
    order_url = cta_url or f"{FRONTEND_URL}/orders"
    cta_markup = ""
    if cta_text:
        cta_markup = (
            f"<a href='{escape(order_url)}' style='display:inline-block;background:#087A34;color:#fff;"
            "text-decoration:none;padding:12px 18px;border-radius:999px;font-weight:800;'>"
            f"{escape(cta_text)}</a>"
        )

    return f"""
    <!doctype html>
    <html>
      <body style="margin:0;background:#f8faf7;color:#103820;font-family:Arial,sans-serif;">
        <div style="max-width:680px;margin:0 auto;padding:24px;">
          <div style="background:#087A34;color:#fff;border-radius:18px 18px 0 0;padding:24px;">
            <h1 style="margin:0;font-size:28px;">FoodNova</h1>
            <p style="margin:6px 0 0;color:#f8fafc;">Quality Foodstuff. Reliable Supply.</p>
          </div>
          <div style="background:#fff;border:1px solid #dde8dd;border-top:0;border-radius:0 0 18px 18px;padding:24px;">
            <h2 style="margin:0 0 10px;color:#103820;">{escape(title)}</h2>
            <p style="font-size:16px;line-height:1.55;color:#111827;">Hello {customer_name},</p>
            <p style="font-size:16px;line-height:1.55;color:#111827;">{escape(message)}</p>
            <div style="background:#eef8ef;border:1px solid #dde8dd;border-radius:14px;padding:16px;margin:18px 0;">
              <p style="margin:0 0 8px;"><strong>Order Code:</strong> {order_code}</p>
              <p style="margin:0 0 8px;"><strong>Total:</strong> {total}</p>
              <p style="margin:0;"><strong>Order Date:</strong> {escape(str(order.get("created_at") or datetime.utcnow().isoformat()))}</p>
            </div>
            <table style="width:100%;border-collapse:collapse;margin:18px 0;color:#111827;">
              <thead>
                <tr style="background:#eef8ef;color:#103820;">
                  <th style="padding:10px;text-align:left;">Item</th>
                  <th style="padding:10px;text-align:center;">Qty</th>
                  <th style="padding:10px;text-align:right;">Unit Price</th>
                  <th style="padding:10px;text-align:right;">Total</th>
                </tr>
              </thead>
              <tbody>{_order_items_html(order)}</tbody>
            </table>
            {extra_html}
            <div style="margin:20px 0;">{cta_markup}</div>
            <p style="font-size:14px;line-height:1.55;color:#64748b;">
              Website: {FOODNOVA_WEBSITE}<br>
              For support, contact {FOODNOVA_EMAIL} or {FOODNOVA_PHONE}.
            </p>
            <hr style="border:0;border-top:1px solid #dde8dd;margin:20px 0;">
            <p style="font-size:12px;line-height:1.5;color:#64748b;margin:0;">
              FoodNova · {FOODNOVA_ADDRESS}<br>
              You received this email because you placed an order or have an account with FoodNova.
            </p>
          </div>
        </div>
      </body>
    </html>
    """


def send_email(to, subject, html, text=None, event_type="", order=None):
    recipient = str(to or "").strip()
    if not recipient:
        print("Email skipped: missing recipient.")
        return {"status": "skipped", "reason": "missing_recipient"}
    if not is_email_enabled():
        print("Email disabled or RESEND_API_KEY missing.")
        return {"status": "skipped", "reason": "disabled"}

    try:
        payload = {
            "from": EMAIL_FROM,
            "to": [recipient],
            "subject": subject,
            "html": html,
        }
        if text:
            payload["text"] = text
        response = resend.Emails.send(payload)
        print(f"Email sent: {event_type or subject} -> {recipient}")
        return {"status": "sent", "response": response}
    except Exception as error:
        print("EMAIL SEND ERROR:", repr(error))
        return {"status": "failed", "error": str(error)}


def send_customer_order_email(order, event_type, extra=None):
    extra = extra or {}
    customer_email = order.get("customer_email")
    order_code = _order_code(order)
    subject = ""
    message = ""
    extra_html = ""
    cta_text = "View Order"
    cta_url = f"{FRONTEND_URL}/orders"

    if event_type == "order_placed":
        subject = f"FoodNova Order Placed - {order_code}"
        message = "Your order has been placed successfully. Use your order code as payment narration and upload your receipt after payment."
        extra_html = (
            "<div style='background:#fff7d6;border:1px solid #FFD23F;border-radius:14px;padding:16px;margin:18px 0;'>"
            "<h3 style='margin:0 0 10px;color:#103820;'>Payment Instructions</h3>"
            f"<p style='margin:4px 0;'>Account Number: <strong>{FOODNOVA_ACCOUNT_NUMBER}</strong></p>"
            f"<p style='margin:4px 0;'>Bank: <strong>{FOODNOVA_BANK}</strong></p>"
            f"<p style='margin:4px 0;'>Account Name: <strong>{FOODNOVA_ACCOUNT_NAME}</strong></p>"
            "<p style='margin:4px 0;'>Payment Narration: Use your Order Code</p>"
            "</div>"
        )
    elif event_type == "receipt_uploaded":
        subject = f"FoodNova Receipt Received - {order_code}"
        filename = extra.get("filename") or "your receipt"
        message = f"We have received your payment receipt ({filename}) and will review it shortly."
    elif event_type == "payment_confirmed":
        subject = f"Payment Confirmed - {order_code}"
        message = "Your payment has been confirmed. We are processing your order. Your invoice/receipt is available in your FoodNova account."
        cta_text = "View Invoice"
        cta_url = f"{FRONTEND_URL}/orders/{order.get('id')}/invoice"
    elif event_type == "payment_rejected":
        subject = f"Payment Receipt Rejected - {order_code}"
        reason = extra.get("reason") or ""
        message = "Your payment receipt was rejected."
        if reason:
            message += f" Reason: {reason}."
        message += " Please upload a clearer receipt or contact support."
    elif event_type == "out_for_delivery":
        subject = f"Your FoodNova Order Is Out for Delivery - {order_code}"
        message = "Your order is out for delivery. The dispatch rider will provide the delivery confirmation code when they arrive."
    elif event_type == "rider_assigned":
        subject = f"Delivery Rider Assigned - {order_code}"
        rider_name = extra.get("rider_name") or order.get("rider_name") or "FoodNova rider"
        rider_phone = extra.get("rider_phone") or order.get("rider_phone") or "Not available"
        message = f"Your FoodNova order has been assigned to a delivery rider. Rider: {rider_name}. Phone: {rider_phone}."
        extra_html = (
            "<div style='background:#eef8ef;border:1px solid #dde8dd;border-radius:14px;padding:16px;margin:18px 0;'>"
            "<h3 style='margin:0 0 10px;color:#103820;'>Delivery Rider</h3>"
            f"<p style='margin:4px 0;'>Rider: <strong>{escape(str(rider_name))}</strong></p>"
            f"<p style='margin:4px 0;'>Phone: <strong>{escape(str(rider_phone))}</strong></p>"
            "</div>"
        )
    elif event_type == "delivered":
        subject = f"FoodNova Order Delivered - {order_code}"
        message = "Your order has been marked as delivered. Thank you for shopping with FoodNova."
    else:
        return {"status": "skipped", "reason": "unknown_event"}

    html = render_order_email_template(order, subject, message, cta_text, cta_url, extra_html)
    text = f"{subject}\n\n{message}\n\nOrder Code: {order_code}\nTotal: {format_naira(order.get('total_amount') or order.get('total') or 0)}\n\n{_order_summary_text(order)}"
    return send_email(customer_email, subject, html, text=text, event_type=event_type, order=order)


def send_admin_email(subject, html, text=None):
    return send_email(ADMIN_NOTIFICATION_EMAIL, subject, html, text=text, event_type="admin_notification")


def render_admin_order_email(order, title, message, extra_html=""):
    order_code = escape(str(_order_code(order)))
    customer_name = escape(str(order.get("customer_name") or "Unknown"))
    customer_phone = escape(str(order.get("customer_phone") or order.get("phone") or "N/A"))
    total = format_naira(order.get("total_amount") or order.get("total") or 0)
    return f"""
    <div style="font-family:Arial,sans-serif;background:#f8faf7;padding:24px;color:#103820;">
      <div style="max-width:660px;margin:0 auto;background:#fff;border:1px solid #dde8dd;border-radius:18px;overflow:hidden;">
        <div style="background:#087A34;color:#fff;padding:20px;">
          <h2 style="margin:0;">{escape(title)}</h2>
          <p style="margin:6px 0 0;">FoodNova admin notification</p>
        </div>
        <div style="padding:20px;">
          <p>{escape(message)}</p>
          <p><strong>Order Code:</strong> {order_code}</p>
          <p><strong>Customer:</strong> {customer_name}</p>
          <p><strong>Phone:</strong> {customer_phone}</p>
          <p><strong>Total:</strong> {total}</p>
          {extra_html}
          <p style="font-size:12px;color:#64748b;margin-top:20px;">FoodNova · {FOODNOVA_EMAIL} · {FOODNOVA_PHONE}</p>
        </div>
      </div>
    </div>
    """


def send_admin_order_email(order, event_type, extra=None):
    extra = extra or {}
    order_code = _order_code(order)
    if event_type == "new_order":
        subject = f"New FoodNova Order - {order_code}"
        message = "A new customer order has been placed."
        extra_html = ""
    elif event_type == "receipt_uploaded":
        subject = f"New Payment Receipt Uploaded - {order_code}"
        receipt_url = extra.get("receipt_url") or ""
        receipt_link = f"<p><strong>Receipt URL:</strong> <a href='{escape(receipt_url)}'>{escape(receipt_url)}</a></p>" if receipt_url else ""
        message = "A customer uploaded a payment receipt."
        extra_html = f"{receipt_link}<p><strong>Payment Status:</strong> {escape(str(order.get('payment_status') or 'receipt_submitted'))}</p>"
    else:
        return {"status": "skipped", "reason": "unknown_event"}

    html = render_admin_order_email(order, subject, message, extra_html)
    text = f"{subject}\n\n{message}\nOrder Code: {order_code}\nCustomer: {order.get('customer_name')}\nPhone: {order.get('customer_phone') or order.get('phone')}\nTotal: {format_naira(order.get('total_amount') or order.get('total') or 0)}"
    return send_admin_email(subject, html, text=text)


def send_low_stock_alert(deduction, order):
    product_name = deduction.get("name") or "Product"
    remaining = deduction.get("new_stock")
    order_code = _order_code(order)
    status = "out of stock" if deduction.get("out_of_stock") else "low in stock"
    subject = "FoodNova Low Stock Alert"
    html = f"""
    <div style="font-family:Arial,sans-serif;background:#f8faf7;padding:24px;color:#103820;">
      <div style="max-width:620px;margin:0 auto;background:#fff;border:1px solid #dde8dd;border-radius:18px;padding:22px;">
        <h2 style="margin-top:0;color:#087A34;">FoodNova Low Stock Alert</h2>
        <p><strong>{escape(str(product_name))}</strong> is now {escape(status)}.</p>
        <p><strong>Remaining stock:</strong> {escape(str(remaining))}</p>
        <p><strong>Order Code:</strong> {escape(str(order_code))}</p>
      </div>
    </div>
    """
    text = f"FoodNova Low Stock Alert\n\n{product_name} is now {status}.\nRemaining stock: {remaining}\nOrder Code: {order_code}"
    return send_admin_email(subject, html, text=text)
