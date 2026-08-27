# CakePOS — Business Requirements, Technical Requirements & System Architecture

## 1. Project Overview

CakePOS is a web-based Point-of-Sale (POS) system designed for a cake decoration equipment and supplies business operating across two branches.

The system will centralize sales, inventory, product, customer, employee, billing, barcode, and reporting operations for both branches.

The primary objectives are:

- Provide a fast and simple POS interface for cashiers.
- Manage inventory separately for each branch.
- Maintain centralized business data.
- Generate and print customer bills/receipts.
- Generate a unique barcode on every bill.
- Allow staff to scan a previous bill barcode and retrieve the transaction.
- Provide sales and inventory reports.
- Support user roles and permissions.
- Maintain at least 6 months of business data backups.
- Provide secure and reliable cloud-based data storage.
- Provide management with visibility across both branches.

---

# 2. Business Scope

The system will cover the following business operations:

1. Point of Sale
2. Product Management
3. Category Management
4. Inventory Management
5. Branch Management
6. Stock Transfers
7. Customer Management
8. Billing and Receipt Printing
9. Barcode Management
10. Returns and Refunds
11. Sales Reporting
12. Inventory Reporting
13. User and Role Management
14. Audit Logging
15. Data Backup and Restoration
16. System Configuration

---

# 3. Business Requirements

## 3.1 Multi-Branch Management

The system shall support two branches.

Each branch shall have:

- Unique branch ID
- Branch name
- Address
- Telephone number
- Branch-specific inventory
- Branch-specific employees
- Branch-specific sales
- Branch-specific reports

The administrator shall be able to:

- View individual branch information.
- View combined information from both branches.
- Compare branch sales.
- Compare branch inventory.
- Transfer stock between branches.

Example:

```text
                   CakePOS
                      |
             Centralized System
                      |
             +--------+--------+
             |                 |
        Branch 01          Branch 02
             |                 |
        POS + Stock        POS + Stock