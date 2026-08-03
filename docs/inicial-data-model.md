# Initial Data Model

## Purpose

This document defines the initial conceptual data model for the electric
motor monitoring platform.

No physical database tables are created at this stage.

## Entities

### Client

Represents a company that owns one or more industrial plants.

Conceptual fields:

- id
- name
- tax_id
- email
- phone
- status
- created_at
- updated_at

### Plant

Represents a physical facility belonging to a client.

Conceptual fields:

- id
- client_id
- name
- description
- location
- latitude
- longitude
- status
- created_at
- updated_at

### Motor

Represents an electric motor installed at a plant.

Conceptual fields:

- id
- plant_id
- name
- code
- manufacturer
- model
- serial_number
- rated_power_kw
- rated_voltage
- rated_current
- rated_frequency_hz
- status
- created_at
- updated_at

### Device

Represents the hardware responsible for measuring and transmitting data.

The initial prototype consists of:

- ESP32
- ADS1220
- SIM7672G

Conceptual fields:

- id
- plant_id
- motor_id
- name
- device_code
- serial_number
- firmware_version
- communication_type
- last_connection_at
- status
- created_at
- updated_at

### Telemetry

Represents time-series measurements transmitted by a device.

Conceptual fields:

- time
- device_id
- motor_id
- measurement_type
- value
- unit
- quality
- received_at

Possible measurement types:

- winding_resistance
- current
- voltage
- temperature
- vibration
- power

This entity will later be implemented as a TimescaleDB hypertable.

### Alarm

Represents an abnormal condition detected for a motor.

Conceptual fields:

- id
- motor_id
- device_id
- alarm_type
- severity
- message
- measured_value
- threshold_value
- unit
- started_at
- acknowledged_at
- resolved_at
- status
- created_at

Possible severity values:

- INFO
- WARNING
- CRITICAL

Possible status values:

- ACTIVE
- ACKNOWLEDGED
- RESOLVED

## Relationships

```mermaid
erDiagram
    CLIENT ||--o{ PLANT : owns
    PLANT ||--o{ MOTOR : contains
    PLANT ||--o{ DEVICE : contains
    MOTOR ||--o{ DEVICE : monitored_by
    DEVICE ||--o{ TELEMETRY : sends
    MOTOR ||--o{ TELEMETRY : receives_measurements
    MOTOR ||--o{ ALARM : generates
    DEVICE ||--o{ ALARM : detects