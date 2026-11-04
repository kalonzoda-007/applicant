# FATIR · Заявщик — Telegram Mini App

Рабочее приложение: https://fatir-mini-app-j17de2.v2.appdeploy.ai/

Планируемый GitHub Pages: https://kalonzoda-007.github.io/applicant/

**Доступ:** откройте вашего FATIR-бота в Telegram, отправьте /app или /start и нажмите кнопку «📲 Открыть FATIR · Заявщик». Обычная ссылка вне Telegram не передаёт авторизацию.

Список разрешённых пользователей: https://docs.google.com/spreadsheets/d/1A449UaomSnY0VeqjX2-j4PiCsqbJ7VVchO1Xp3uHWtM/edit

Лист USERS: telegram_id, full_name, username, role, active, region, notes. Роль applicant, requester, logistic или admin. Для разрешения укажите active=TRUE. Для отключения — active=FALSE.

Общая база заказов: https://docs.google.com/spreadsheets/d/19DQVv-n-678oIxwXuHcEnbAAq-dy9irtj4lBmmFkyvE/edit

Проверка подписи Telegram initData, ролей, товаров и запись ORD выполняются только сервером AppDeploy и n8n Google OAuth. Публичный GitHub хранит только статический интерфейс; секреты и список пользователей не публикуются.

**Однократное включение GitHub Pages владельцем:** https://github.com/kalonzoda-007/applicant/settings/pages → Build and deployment → Source → GitHub Actions. Workflow .github/workflows/pages.yml уже настроен. До включения GitHub Pages адрес github.io может отвечать 404.

Заказы новых клиентов получают NEEDS_REVIEW и требуют проверки логиста. Не использовать тестовые заявки для отгрузки.
