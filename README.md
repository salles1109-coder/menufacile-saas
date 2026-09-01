# MenuFacile SaaS

MenuFacile is a multi-business SaaS platform designed to help small businesses manage digital sales, orders, appointments and customer interactions from a single system.

The project was built as a complete web application, covering backend logic, database modeling, administrative interfaces, customer-facing pages, integrations and deployment.

## Business segments

MenuFacile supports four main use cases:

- **Food & Delivery** — digital menu, orders, delivery/pickup flow and order status management.
- **Appointments & Services** — professionals, services, scheduling and appointment management.
- **Custom Orders** — advance orders, pickup/delivery dates, deposits and order organization.
- **Online Products** — product catalog and online purchasing flow.

## Main features

- Multi-business architecture
- Administrative dashboard
- Employee access
- Product and service management
- Orders and reservations
- Payment workflows
- Financial controls
- Push notifications
- WhatsApp-related integrations
- Mobile-friendly public pages
- PWA support
- Multilingual interface

## Tech stack

- **Python**
- **FastAPI**
- **SQLAlchemy**
- **SQLite**
- **Jinja2**
- **JavaScript**
- **HTML / CSS**
- **ODBC / Power BI integration**
- **Git / GitHub**
- **Linux VPS deployment**

## Project structure

```text
menufacile-saas/
├── backend/
│   ├── services/      # Business logic and integrations
│   ├── static/        # CSS, JavaScript, PWA assets and images
│   ├── templates/     # Administrative and public interfaces
│   ├── workers/       # Background processing
│   ├── main.py        # Main application routes and orchestration
│   ├── models.py      # Database models
│   ├── schemas.py     # Application schemas
│   └── database.py    # Database configuration
├── requirements.txt
└── .gitignore
```

## Data model

The application uses a relational model centered around each business/company.

```text
Empresa
├── Categorias → Itens
├── Pedidos → PedidoItens
├── Profissionais → Reservas
├── HorariosReserva
├── DiasFechados
└── FechamentosCaixa
```

This structure allows different business modules to share the same SaaS foundation while keeping operational data organized by company.

## Business Intelligence

MenuFacile data was also used to build a separate Business Intelligence portfolio project with **Power BI, Power Query, DAX, SQLite and data modeling**.

[View the MenuFacile Power BI Portfolio](https://github.com/salles1109-coder/menufacile-powerbi-portfolio)

## Live project & demos

**Main website:** [MenuFacile](https://menufacile.org/)

Explore the platform through live demo environments representing different business segments:

- **Food & Delivery — Bella Food:** [Open live demo](https://menufacile.org/menu/bella-pizza)
- **Appointments & Services — Studio Bella:** [Open live demo](https://menufacile.org/menu/studio-bella)
- **Online Store & Product Catalog — MenuFacile Store:** [Open live demo](https://menufacile.org/menu/iphone)
- **Custom Orders & Scheduled Production — Encomenda Facile:** available from the demo section on the [MenuFacile website](https://menufacile.org/)

The demos allow recruiters and visitors to explore real customer-facing flows such as digital ordering, scheduling, product browsing and scheduled custom orders.

## Security

Sensitive production data is intentionally excluded from this public repository. Environment variables, databases, private keys, backups and deployment-specific credentials are not versioned.

## About this project

This repository is a clean public portfolio version of MenuFacile, focused on demonstrating software development, backend architecture, database design, business rules, integrations and user-interface implementation.
