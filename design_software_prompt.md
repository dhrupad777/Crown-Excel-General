# Structural Blueprint & Wireframe Specification Prompt
**Target Tool:** UI/UX Design Software, Wireframing Tools, Figma AI, or Screen Generators  
**Project:** Crown Excel Electronics — Enterprise Billing & Inventory Platform  
**Instruction for Design Tool:** Generate functional wireframes and screen layouts based *strictly* on the structural components, data fields, and interactive workflows listed below. Do not apply predefined color palettes, visual styling, or decorative embellishments; focus entirely on information architecture, component placement, and feature completeness.

---

## Screen 1: Navigation Bar & Global Header (Persistent across all screens)
*Purpose: Provides primary navigation, real-time hardware status, and system controls.*

### Required Components & Elements:
- **Brand Identity Area**: Text label for "Crown Excel Electronics".
- **Primary Navigation Tabs/Links**:
  - `Billing Desk` (Main active checkout screen)
  - `Invoices Archive` (Past warranty bills and search)
  - `Products & IMEIs` (Device catalog and inventory)
  - `Customers CRM` (Client database and order history)
- **System Status Indicators**:
  - Hardware Scanner Listener Status (Indicator showing whether physical barcode scanner gun input is active).
  - Storage & Sync Status (Indicator showing offline local cache status and cloud sync state).
  - Real-Time Clock & Date Display.
- **Global Actions**:
  - System Settings / Data Configuration Trigger Button.

---

## Screen 2: Billing Desk & Checkout Screen (Primary Operational View)
*Purpose: Rapid barcode scanning, IMEI serial number recording, customer attachment, and bill finalization.*

### Layout Structure:
- **Left / Center Section (approx. 65% width)**: Scanned Device Items Table & Hardware Search Controls.
- **Right Section (approx. 35% width)**: Customer Attachment Panel & Financial Calculation/Checkout Card.

### Required Components & Features:

#### A. Top Control Bar (Above Item Table)
- **WhatsApp Reference Input**: Text input field to bind incoming WhatsApp order numbers (e.g., `#WA-XXXX`).
- **Manual Device Search & Autocomplete**: Search bar allowing operator to type device models, barcodes, or categories if physical scanner is not used. Includes an inline autocomplete dropdown list showing matching devices, stock counts, and unit prices.
- **"Add Custom Device" Action Button**: Trigger button that opens the *Instant Device Registration Modal* for unrecognized items.

#### B. Active Bill Items Table (Main Area)
- **Table Headers**: Barcode Number, Device Model & Category, Unit Price, Quantity, Total Line Price, Remove Item Action.
- **Row Content per Scanned Device**:
  - Barcode text string.
  - Device Model Name and Category Label.
  - **Mandatory IMEI / Serial Number Input Field**: A dedicated text box embedded inside the item row, prompting the operator to scan or type the 15-digit IMEI or warranty serial number for laptops and mobile phones.
  - Unit Price display.
  - Quantity Control: Interactive `-` button, numerical quantity input box, and `+` button.
  - Line Total calculated price display.
  - Delete/Remove Item icon button.
- **Empty State**: Placeholder area displayed when zero items are scanned, showing instructions to use the barcode gun or search box.

#### C. Customer Attachment Panel (Right Column Top)
- **Customer Search & Autocomplete**: Search input field to find existing customers by WhatsApp number, name, or company. Displays autocomplete dropdown with past order counts.
- **Attached Customer Card (When Selected)**: Displays Customer Name, Company Name, WhatsApp Phone Number, Email Address, and a "Change Customer" button.
- **"New Customer" Action Button**: Trigger button that opens the *Instant Customer Registration Modal*.

#### D. Bill Calculation & Checkout Card (Right Column Bottom)
- **Financial Breakdown**:
  - Subtotal display.
  - Tax / GST Rate Selector Dropdown (options for 0%, 5%, 10%, 18%).
  - Discount Numerical Input Box ($).
  - Total Payable Amount (prominent large display).
- **Warranty Notes Field**: Multi-line text area for delivery instructions or AppleCare/warranty terms.
- **Finalize & Save Button**: Primary checkout action button (must visually indicate support for keyboard shortcut `Ctrl+S`).

---

## Screen 3: Products & IMEIs Catalog Manager Screen
*Purpose: Manage device inventory, stock levels, pricing, and IMEI tracking rules.*

### Layout Structure:
- **Top Bar**: Screen Title, Export Controls, and Create Action Button.
- **Filter Toolbar**: Keyword Search Bar and Category Filtering Tabs.
- **Main Content**: Comprehensive Inventory Data Table.

### Required Components & Features:
- **Header Actions**:
  - "Add New Device" Trigger Button (opens registration modal).
  - "Export CSV" Button (downloads entire catalog).
- **Search & Filter Toolbar**:
  - Keyword search box (filtering by model name, barcode, or category).
  - Category Filter Tabs: `All`, `Laptops`, `Mobile Phones`, `Tablets`, `Audio & Wearables`, `Accessories`, `Gaming`, `Peripherals`.
  - Item count summary indicator (showing filtered vs. total inventory).
- **Inventory Data Table**:
  - **Table Headers**: Barcode, Device Model & Specs, Category, Unit Price, Stock Level, IMEI Requirement Status, Actions.
  - **Row Content**:
    - Barcode string.
    - Device Model Name and Unit Type label.
    - Category tag.
    - Unit Price display.
    - Stock Quantity indicator.
    - IMEI Requirement Indicator (displaying whether the item requires mandatory IMEI scanning during checkout).
    - Action Buttons: `Edit Device` icon and `Delete Device` icon.

---

## Screen 4: Invoices & Warranty Archive Screen
*Purpose: Sub-millisecond querying of past bills, IMEI tracking audits, and PDF warranty printing.*

### Layout Structure:
- **Top Section**: Financial Summary Statistics Cards.
- **Middle Section**: Multi-Field Query Toolbar and Date Filters.
- **Bottom Section**: Archived Invoices Data Table.

### Required Components & Features:
- **Summary Statistics Bar (3-4 Cards)**:
  - Total Revenue Card (sum of filtered invoices).
  - Total Invoices Count Card.
  - Total Devices Sold Card.
  - Export Actions Card ("Export Invoices & IMEIs CSV" button).
- **Query & Filter Toolbar**:
  - **Instant Multi-Field Search Box**: Search input capable of querying across WhatsApp Reference numbers, Invoice IDs, Customer Names, Phone Numbers, Device Models, and **recorded IMEI strings**.
  - **Date Range Filter Tabs**: `All Records`, `Today`, `Last 7 Days`, `This Month`.
- **Invoices Data Table**:
  - **Table Headers**: WhatsApp Ref, Invoice ID & Date, Customer Details, Devices Count, Total Amount Paid, Status, Actions.
  - **Row Content**:
    - WhatsApp Reference tag (e.g., `#WA-8901`).
    - Invoice ID and timestamp.
    - Customer Name and WhatsApp Phone Number.
    - Device count summary.
    - Total Paid amount.
    - Payment Status label (`Paid`).
    - Action Buttons: `View Details / Print` icon (opens Invoice Details Modal) and `Delete` icon.

---

## Screen 5: Customers CRM Database Screen
*Purpose: Maintain client contact details and track lifetime purchase histories.*

### Layout Structure:
- **Top Bar**: Title and Action Buttons.
- **Search Toolbar**: Keyword Search Box and Count Indicator.
- **Main Content**: CRM Data Table.

### Required Components & Features:
- **Header Actions**: "Add New Customer" Button and "Export CSV" Button.
- **Search Toolbar**: Keyword search box (filter by name, company, or WhatsApp number) and total customer count.
- **Customers Data Table**:
  - **Table Headers**: Customer Name, Company Name, WhatsApp / Phone Number, Email Address, Total Orders Count, Lifetime Spend, Actions.
  - **Row Content**: Contact name, business name, WhatsApp number, email, numerical order count, total revenue spend, and action buttons (`Edit`, `Delete`).

---

## Modals & Overlay Screens (Triggered from Main Views)

### Modal 1: Instant New Device Registration Modal
*Triggered from Billing Desk or Products Manager when adding an unknown barcode or new inventory.*
- **Form Fields**:
  - Barcode Number Input (pre-filled if triggered via scanner gun).
  - Device Category Dropdown Selector.
  - Model Name & Specs Description Text Input.
  - Unit Price Numerical Input ($).
  - Initial Stock Quantity Numerical Input.
  - Unit Type Selector Dropdown (`Unit`, `Piece`, `Pair`, `Box`).
  - **IMEI Tracking Requirement Checkbox**: Toggle labeled "Requires IMEI / Serial Number Tracking on Bills".
- **Footer Actions**: `Cancel` button and `Save & Attach to Bill` primary button.

### Modal 2: Instant New Customer Registration Modal
*Triggered from Billing Desk or Customers CRM when adding a new client.*
- **Form Fields**:
  - Customer / Contact Person Name Text Input.
  - Company / Business Name Text Input (Optional).
  - WhatsApp / Phone Number Text Input (Required).
  - Email Address Text Input (Optional).
- **Footer Actions**: `Cancel` button and `Save & Attach Customer` primary button.

### Modal 3: Invoice Details & Printable Warranty PDF Overlay
*Triggered when clicking any invoice row in the Invoices Archive.*
- **Header Section**: Company Title, WhatsApp Reference Number tag, Invoice ID, and Billing Timestamp.
- **Contact Summary**: Billed Customer Name, Company, WhatsApp Number, and Email.
- **Itemized Warranty Table**:
  - Table showing Device Model, **Recorded IMEI / Serial Number string**, Unit Price, Quantity, and Line Total.
- **Financial Summary**: Subtotal, Tax Amount, Discount Amount, and Total Amount Paid.
- **Notes Section**: Display of custom warranty or delivery instructions.
- **Footer Actions**: `Delete Invoice` button, `Close` button, and `Print Warranty PDF` primary action button.

### Modal 4: System Settings & Data Engine Modal
*Triggered from Navigation Bar settings icon.*
- **Configuration Controls**:
  - Offline Local Memory & IndexedDB Status Display.
  - Firebase Cloud Sync Configuration & Status Toggle.
  - Database Backup Download Button (JSON export).
  - Database Restore / Import File Upload.
  - Demo Data Reset Button.
