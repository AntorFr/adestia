# The browser the bench looks through.
#
# Playwright's own image already carries the browsers and their system
# libraries; only the driver library is missing, and it is installed globally
# because /bench is a bind mount at run time — anything the image puts there
# would be shadowed by it.
FROM mcr.microsoft.com/playwright:v1.56.0-noble
RUN npm install -g playwright-core@1.56.0
WORKDIR /bench
