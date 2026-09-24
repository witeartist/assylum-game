# ASSYLUM

Браузерная хоррор-игра с видом сверху: побег из психбольницы №6. Сделана на Phaser 3, TypeScript
и Vite; мультиплеер работает напрямую между браузерами через PeerJS.

## Запуск

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # production-сборка в dist/
```

Мультиплеер по умолчанию использует публичный сервер PeerJS. Чтобы подключить свой, задай
переменную `VITE_PEER_SERVER`:

```bash
VITE_PEER_SERVER=localhost:9000 npm run dev   # или https://peer.example.com/path
```

## Документы

- [docs/ROADMAP.md](docs/ROADMAP.md) — план работ по этапам.
- [docs/ASSETS.md](docs/ASSETS.md) — список ассетов с готовыми промптами для генерации.
