# Gestor de Motores Eléctricos

Plataforma para monitorear motores eléctricos, visualizar telemetría en tiempo real, gestionar alarmas y consultar información histórica.

## Arquitectura inicial

```text
Simulador TypeScript
        |
       MQTT
        |
Eclipse Mosquitto
        |
      NestJS
       /   \
TimescaleDB WebSocket
                |
             Next.js

## Database migrations

The initial database schema is managed through versioned SQL files located in:

```text
database/migrations/