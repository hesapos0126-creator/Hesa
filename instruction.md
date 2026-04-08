# Project Hesa: POS & Inventory Management System (Updated)

## 1. Project Overview
* **Business Name:** Hesa
* **Phone:** 0760492705
* **Tagline:** Effortless style for every occasion
* **Social Media:** FB (Hesa Collection), Instagram (hesacollection)

---

## 2. Business Requirements

### A. Product & Inventory Management
* **Categorization:** Every product must be tagged as `Hesa Elegant` or `Hesa Casual`.
* **Attributes:** Product Name, SKU/Barcode, Category, **Color**, Original Price, Discounted Price, and Stock Quantity.
* **Management:** Add/Update products, change pricing, and apply discounts.

### B. Sales & Billing (Invoice Logic)
* **Invoice Numbering:**
    * If the bill contains only **Hesa Elegant** items: Prefix with `HCE-` (e.g., HCE-1001).
    * If the bill contains only **Hesa Casual** items: Prefix with `HCC-` (e.g., HCC-1001).
    * *Note:* If mixed, system should default to a general `HES-` prefix or use the dominant category.
* **Customer Data:** Capture Name and Mobile Number.
* **Print Layout:**
    * **Header:** Business Name, Phone (0760492705), Tagline.
    * **Body:** Invoice No, Date, Item list (Name, Color, Qty, Price, Subtotal).
    * **Footer:** * "Thank you for shopping with Hesa!"
        * **Return Policy:** "Returns are accepted only within 7 days of purchase. Please inform us within this period."
        * **Social Media Icons:** FB (Hesa Collection) | IG (hesacollection).

### C. Returns & Exchanges
* **Search:** Returns must be processed **only** by searching the **Invoice Number**.
* **Logic:** 1. Validate if the return is within the 7-day policy window.
    2. Add the item back to the stock inventory automatically.
    3. Generate a **Return Bill** (Credit Note) for the customer.
* **Reporting:** Log return details (Invoice No, Item, Reason, Date) for monthly/yearly summaries.

### D. Reporting & Analytics
* **Formats:** Daily, Weekly, Monthly, and Yearly reports.
* **Export:** All reports must be downloadable as PDF.
* **Content:** Sales revenue, return deductions, net profit, and category-wise performance.

---

## 3. Technical Requirements

### A. Tech Stack
* **UI:** HTML5, Tailwind CSS.
* **Logic:** JavaScript (ES6+).
* **Database:** **Dexie.js** (IndexedDB) for local data storage.
* **PDF Engine:** `html2pdf.js` for high-quality bill and report generation.

### B. Database Schema (Dexie.js)
* `products`: `++id, name, barcode, category, color, price, discount, stock`
* `sales`: `++id, invoicePrefix, invoiceNumber, customerMobile, items, total, timestamp`
* `returns`: `++id, originalInvoiceNumber, barcode, returnDate, refundAmount`
* `customers`: `++id, name, mobile`

### C. Key Logic Modules
1.  **Prefix Generator:** A function to check the `category` of all items in the cart and return the appropriate prefix (`HCE-` or `HCC-`).
2.  **Date Validator:** A script to compare the current date with the `sales.timestamp` to enforce the 7-day return policy.
3.  **Invoice Component:** A hidden HTML template for the bill that includes the social media icons and phone number, which becomes visible only during the print/PDF trigger.
4.  **Inventory Sync:** When a return is saved in the `returns` table, a `db.products.update` call must be triggered to increment the stock.
5.  **Access Control:** Authentication system protecting the dashboard.
    *   **Login:** Required before accessing any feature.
    *   **Logs:** Audit trail of Logins, Logouts, and Failed attempts.

### E. Access Control & Security
*   **Authentication:** Users must log in with a username and password.
*   **Default Admin:** Username: `admin`, Password: `admin123`.
*   **Audit Logging:** System must record:
    *   Login events (Success/Failure)
    *   Logout events
    *   User actions (timestamped)

---

## 4. UI/UX Design
* **Clean Layout:** Sidebar for navigation, main area for POS/Inventory.
* **Social Branding:** Use official Brand Colors for FB and Instagram icons in the bill footer.
* **Mobile-Friendly:** Ensure the interface is usable on smaller screens for online order management.

---

## 5. Development Roadmap
1.  Setup Dexie DB and Product management UI (with Color field).
2.  Build POS interface with Category-based Invoice Prefix logic.
3.  Develop the 7-day Return Logic and Return Bill generator.
4.  Design the PDF templates for Sales Bills and Returns.
5.  Create the Report Dashboard with Date filters and PDF export.