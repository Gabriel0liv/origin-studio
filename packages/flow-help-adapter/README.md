# Flow Help Adapter

Future adapter package for integrating `mathgeniuszach/origins-flow-help` with Origin Studio.

Planned responsibilities:

- read `index.yaml` and referenced `data/*.yaml` pages;
- normalize pages and links into Origin Studio friendly structures;
- support a guided "What do you want to make?" flow;
- suggest power, action, and condition types from user answers.

The current MVP exports a small builtin registry and the expected normalized types so the web app can expose a Help drawer without hardcoding this structure inside the frontend.
