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

## Live project

[Visit MenuFacile](https://menufacile.org)

Individual demo links for each business segment will be documented here as part of the portfolio presentation.

## Security

Sensitive production data is intentionally excluded from this public repository. Environment variables, databases, private keys, backups and deployment-specific credentials are not versioned.

## About this project

This repository is a clean public portfolio version of MenuFacile, focused on demonstrating software development, backend architecture, database design, business rules, integrations and user-interface implementation.
