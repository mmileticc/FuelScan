# FuelScan ⛽📄

A practical full-stack application designed to automatically scan, archive, and analyze fuel receipts to track vehicle expenses and monitor fuel price trends.

The project was born out of a personal need to automate financial tracking and eliminate the hassle of manually storing paper receipts.

---
> ⚠️ **Project Status:** This application is currently an **MVP (Minimum Viable Product) and actively in development**. Core functionalities are stable, with analytics and features being continuously rolled out.

---

### 🚀 Key Features

*   **Automated Data Extraction:** Uses a custom web scraping pipeline powered by **Python** and **Playwright** to extract transaction details from digital or archived receipts.
*   **Secure User Authentication:** Integrated with **Supabase Auth** (Google Sign-In) ensuring that each user securely manages and accesses their own private dashboard and data.
*   **Expense Analytics & Statistics:** Tracks fuel consumption over time and generates insights into fuel price fluctuations.
*   **Cloud Storage:** Safely stores structured receipt data and metadata in a **Supabase** backend.

---

### 🛠️ Tech Stack

*   **Backend & Scraping:** Python, Playwright
*   **Database & Auth:** Supabase (PostgreSQL, JWT, Google OAuth)
*   **Frontend:** Vanilla JS / HTML / CSS (Designed for rapid prototyping and clean functionality)

---

### ⚙️ How It Works (High-Level)

1.  **Sign In:** User logs in securely via Google OAuth.
2.  **Scrape/Upload:** The Python engine utilizes Playwright to target, fetch, and parse receipt data.
3.  **Process & Store:** Extracted data (date, price per liter, total amount, fuel type) is structured and saved to the user's isolated database instance.
4.  **Visualize:** The frontend pulls the structured data to display personal spending statistics and historical price charts.
