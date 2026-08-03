# Logical Data Model

## Purpose

This document defines the initial PostgreSQL logical data model for the
electric motor monitoring platform.

The model is a design proposal. No database migration has been executed yet.

## General conventions

- Table and column names use snake_case.
- Table names use plural form.
- Primary identifiers use UUID.
- Dates use TIMESTAMPTZ.
- Electrical and measurement values use NUMERIC.
- Status values use VARCHAR with CHECK constraints.
- Telemetry records are append-only.
- Telemetry will later be converted into a TimescaleDB hypertable.
- Clients, plants, motors, and devices use logical status instead of physical
  deletion.

## Tables

### clients

Represents companies or organizations using the platform.

| Column | Type | Required | Description |
|---|---|---:|---|
| id | UUID | Yes | Primary identifier |
| name | VARCHAR(150) | Yes | Client name |
| tax_id | VARCHAR(30) | No | Tax or organization identifier |
| email | VARCHAR(255) | No | Contact email |
| phone | VARCHAR(30) | No | Contact phone |
| status | VARCHAR(20) | Yes | ACTIVE or INACTIVE |
| created_at | TIMESTAMPTZ | Yes | Creation timestamp |
| updated_at | TIMESTAMPTZ | Yes | Last update timestamp |

### plants

Represents physical facilities belonging to a client.

| Column | Type | Required | Description |
|---|---|---:|---|
| id | UUID | Yes | Primary identifier |
| client_id | UUID | Yes | Client foreign key |
| name | VARCHAR(150) | Yes | Plant name |
| code | VARCHAR(50) | Yes | Client-specific plant code |
| description | TEXT | No | Plant description |
| location | VARCHAR(255) | No | Address or location |
| latitude | NUMERIC(9,6) | No | Geographic latitude |
| longitude | NUMERIC(10,6) | No | Geographic longitude |
| status | VARCHAR(20) | Yes | ACTIVE or INACTIVE |
| created_at | TIMESTAMPTZ | Yes | Creation timestamp |
| updated_at | TIMESTAMPTZ | Yes | Last update timestamp |

### motors

Represents electric motors installed in a plant.

| Column | Type | Required | Description |
|---|---|---:|---|
| id | UUID | Yes | Primary identifier |
| plant_id | UUID | Yes | Plant foreign key |
| name | VARCHAR(150) | Yes | Motor name |
| code | VARCHAR(50) | Yes | Plant-specific motor code |
| manufacturer | VARCHAR(100) | No | Manufacturer |
| model | VARCHAR(100) | No | Model |
| serial_number | VARCHAR(100) | No | Manufacturer serial number |
| rated_power_kw | NUMERIC(12,3) | No | Rated power |
| rated_voltage | NUMERIC(12,3) | No | Rated voltage |
| rated_current | NUMERIC(12,3) | No | Rated current |
| rated_frequency_hz | NUMERIC(8,3) | No | Rated frequency |
| status | VARCHAR(20) | Yes | Operational status |
| created_at | TIMESTAMPTZ | Yes | Creation timestamp |
| updated_at | TIMESTAMPTZ | Yes | Last update timestamp |

### devices

Represents measurement and communication hardware.

| Column | Type | Required | Description |
|---|---|---:|---|
| id | UUID | Yes | Primary identifier |
| plant_id | UUID | Yes | Plant foreign key |
| motor_id | UUID | No | Currently assigned motor |
| name | VARCHAR(150) | Yes | Device name |
| device_code | VARCHAR(80) | Yes | Platform device identifier |
| serial_number | VARCHAR(100) | No | Hardware serial number |
| firmware_version | VARCHAR(50) | No | Installed firmware |
| communication_type | VARCHAR(20) | Yes | LTE, WIFI or LORAWAN |
| last_connection_at | TIMESTAMPTZ | No | Last known connection |
| status | VARCHAR(20) | Yes | Device status |
| configuration | JSONB | Yes | Non-sensitive device configuration |
| created_at | TIMESTAMPTZ | Yes | Creation timestamp |
| updated_at | TIMESTAMPTZ | Yes | Last update timestamp |

### telemetry

Represents immutable time-series measurements.

| Column | Type | Required | Description |
|---|---|---:|---|
| id | UUID | Yes | Telemetry identifier |
| measured_at | TIMESTAMPTZ | Yes | Measurement time |
| received_at | TIMESTAMPTZ | Yes | Server reception time |
| device_id | UUID | Yes | Device foreign key |
| motor_id | UUID | Yes | Motor foreign key |
| measurement_type | VARCHAR(50) | Yes | Measurement variable |
| value | NUMERIC(18,6) | Yes | Measurement value |
| unit | VARCHAR(20) | Yes | Measurement unit |
| quality | VARCHAR(20) | Yes | GOOD, UNCERTAIN or BAD |
| metadata | JSONB | Yes | Optional measurement metadata |

The primary key will be composed of id and measured_at so it remains compatible
with TimescaleDB hypertable requirements.

### alarms

Represents abnormal motor conditions.

| Column | Type | Required | Description |
|---|---|---:|---|
| id | UUID | Yes | Primary identifier |
| motor_id | UUID | Yes | Affected motor |
| device_id | UUID | No | Source device |
| alarm_type | VARCHAR(80) | Yes | Alarm classification |
| severity | VARCHAR(20) | Yes | INFO, WARNING or CRITICAL |
| message | TEXT | Yes | Alarm description |
| measured_value | NUMERIC(18,6) | No | Value that caused the alarm |
| threshold_value | NUMERIC(18,6) | No | Configured threshold |
| unit | VARCHAR(20) | No | Measurement unit |
| started_at | TIMESTAMPTZ | Yes | Alarm start |
| acknowledged_at | TIMESTAMPTZ | No | Acknowledgement time |
| resolved_at | TIMESTAMPTZ | No | Resolution time |
| status | VARCHAR(20) | Yes | Alarm lifecycle status |
| created_at | TIMESTAMPTZ | Yes | Creation timestamp |
| updated_at | TIMESTAMPTZ | Yes | Last update timestamp |

## Relationships

- One client has many plants.
- One plant has many motors.
- One plant has many devices.
- One motor may have many devices over time.
- One device generates many telemetry records.
- One motor has many telemetry records.
- One motor generates many alarms.
- One device may generate many alarms.

## Deferred entities

The following entities are deliberately excluded from the initial beta:

- users
- roles and permissions
- device assignment history
- maintenance events
- alarm rules
- notifications
- work orders
- firmware deployment history
