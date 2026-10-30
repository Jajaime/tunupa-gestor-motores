'use client';

import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import Link from 'next/link';
import { useAuth } from '@/components/auth/auth-provider';
import { AppSidebar } from '@/components/layout/app-sidebar';
import {
  createDevice,
  getDevices,
  getFleetMotors,
  updateDevice,
} from '@/lib/api';
import type { DeviceInventory, FleetMotorSummary } from '@/lib/types';
import { dateLabel } from '@/components/motors/motor-labels';

type Communication = 'WIFI' | 'LTE' | 'LORAWAN';

const communicationLabels: Record<Communication, string> = {
  WIFI: 'Wi-Fi · ESP32',
  LTE: '4G LTE · módem',
  LORAWAN: 'LoRaWAN',
};

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : 'No fue posible completar la operación.';
}

export function DevicesPage() {
  const { user, signOut } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const [devices, setDevices] = useState<DeviceInventory[]>([]);
  const [motors, setMotors] = useState<FleetMotorSummary[]>([]);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('ALL');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [motorId, setMotorId] = useState('');
  const [communicationType, setCommunicationType] = useState<Communication>('WIFI');
  const [serialNumber, setSerialNumber] = useState('');
  const [firmwareVersion, setFirmwareVersion] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editCommunication, setEditCommunication] = useState<Communication>('WIFI');
  const [editSerial, setEditSerial] = useState('');
  const [editFirmware, setEditFirmware] = useState('');

  useEffect(() => {
    let alive = true;
    void Promise.all([getDevices(), isAdmin ? getFleetMotors() : Promise.resolve([])])
      .then(([rows, motorRows]) => {
        if (alive) {
          setDevices(rows);
          setMotors(motorRows);
          setError('');
        }
      })
      .catch((failure: unknown) => { if (alive) setError(errorText(failure)); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [revision, isAdmin]);

  const filtered = useMemo(() => {
    const q = search.trim().toLocaleLowerCase('es');
    return devices.filter((device) => {
      if (status !== 'ALL' && device.status !== status) return false;
      return !q || [device.name, device.code, device.serialNumber ?? '',
        device.motorName ?? '', device.plantName, device.clientName]
        .some((value) => value.toLocaleLowerCase('es').includes(q));
    });
  }, [devices, search, status]);

  const selected = editId ? devices.find((item) => item.id === editId) : undefined;

  function refresh() {
    setLoading(true);
    setRevision((value) => value + 1);
  }

  function selectForEdit(device: DeviceInventory) {
    if (editId === device.id) { setEditId(null); return; }
    setEditId(device.id);
    setEditName(device.name);
    setEditCommunication(device.communicationType as Communication);
    setEditSerial(device.serialNumber ?? '');
    setEditFirmware(device.firmwareVersion ?? '');
    setNotice('');
  }

  async function submitCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isAdmin || busy) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const created = await createDevice({
        motorId, name: name.trim(), code: code.trim(), communicationType,
        serialNumber: serialNumber.trim() || undefined,
        firmwareVersion: firmwareVersion.trim() || undefined,
      });
      setDevices((old) => [...old, created].sort((a, b) => a.name.localeCompare(b.name, 'es')));
      setName(''); setCode(''); setSerialNumber(''); setFirmwareVersion('');
      setNotice('Gateway registrado. Queda en REGISTERED hasta recibir conexión/telemetría.');
    } catch (failure) { setError(errorText(failure)); }
    finally { setBusy(false); }
  }

  async function submitEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isAdmin || !selected || busy) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const updated = await updateDevice(selected.id, {
        name: editName.trim(), communicationType: editCommunication,
        serialNumber: editSerial.trim() || null,
        firmwareVersion: editFirmware.trim() || null,
      });
      setDevices((old) => old.map((device) => device.id === updated.id ? updated : device));
      setEditId(null);
      setNotice(`Datos técnicos de ${updated.code} actualizados.`);
    } catch (failure) { setError(errorText(failure)); }
    finally { setBusy(false); }
  }

  return (
    <main className="app-shell">
      <AppSidebar role={user?.role} />
      <section className="content">
        <header className="topbar">
          <div>
            <span className="eyebrow">GROUNDTEK · DISPOSITIVOS DE MEDICIÓN</span>
            <h1>Dispositivos</h1>
            <p>Gateways vinculados a motores y últimos registros de conectividad.</p>
          </div>
          <div className="session-actions">
            <span className="session-user">{user?.displayName ?? user?.email}</span>
            <div>
              <button className="refresh-button" type="button" disabled={loading}
                onClick={refresh}>{loading ? 'Consultando…' : 'Actualizar'}</button>
              <button className="refresh-button" type="button" onClick={() => void signOut()}>
                Cerrar sesión
              </button>
            </div>
          </div>
        </header>

        <p className="telemetry-notice">
          La conexión y el estado operativo se actualizan desde MQTT. Registrar un gateway
          no configura sus credenciales ni autoriza automáticamente un equipo físico.
          El sensor RS485 (por ejemplo, SKIM400) se conectará a un gateway compatible.
        </p>
        {error && <div className="error-banner" role="alert">{error}</div>}
        {notice && <p className="admin-feedback" role="status">{notice}</p>}

        <div className="fleet-toolbar">
          <label>Buscar dispositivo, motor, código o empresa
            <input type="search" value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Ej. ESP32-LAB-001" />
          </label>
          <label>Estado de conectividad
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="ALL">Todos</option>
              <option value="REGISTERED">Registrado</option>
              <option value="ACTIVE">Activo</option>
              <option value="INACTIVE">Inactivo</option>
              <option value="MAINTENANCE">Mantenimiento</option>
            </select>
          </label>
        </div>

        <section className="panel fleet-panel">
          <div className="panel-heading">
            <div><span className="eyebrow">INVENTARIO</span><h2>Gateways registrados</h2></div>
            <span>{filtered.length} de {devices.length} dispositivos</span>
          </div>
          {loading && devices.length === 0 ? (
            <p className="fleet-empty">Consultando dispositivos…</p>
          ) : filtered.length === 0 ? (
            <p className="fleet-empty">No hay dispositivos con estos filtros o permisos.</p>
          ) : (
            <div className="fleet-table-wrap">
              <table className="fleet-table">
                <thead><tr>
                  <th>Gateway</th><th>Motor y planta</th><th>Comunicación</th>
                  <th>Estado</th><th>Última conexión</th><th>Última telemetría</th><th>Acción</th>
                </tr></thead>
                <tbody>{filtered.map((device) => (
                  <tr key={device.id}>
                    <td><strong>{device.name}</strong><small>{device.code}</small>
                      {device.serialNumber && <small>Serie: {device.serialNumber}</small>}
                      {device.firmwareVersion && <small>Firmware: {device.firmwareVersion}</small>}</td>
                    <td>{device.motorName
                      ? <Link className="fleet-link" href={`/motors/${device.motorId}`}>{device.motorName}</Link>
                      : 'Sin motor asociado'}
                      <small>{device.clientName} · {device.plantName}</small></td>
                    <td>{device.communicationType}</td>
                    <td><span className={`status-pill ${device.status === 'ACTIVE' ? 'online' : 'offline'}`}>
                      {device.status}</span></td>
                    <td>{dateLabel(device.lastConnectionAt)}</td>
                    <td>{dateLabel(device.lastTelemetryReceivedAt)}</td>
                    <td>{isAdmin ? <button className="refresh-button" type="button"
                      onClick={() => selectForEdit(device)} disabled={busy}>
                      {editId === device.id ? 'Cancelar' : 'Editar'}</button> : 'Solo lectura'}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </section>

        {isAdmin && selected && (
          <section className="panel fleet-detail-panel">
            <div className="panel-heading"><h2>Editar datos de {selected.code}</h2></div>
            <p className="admin-muted">No se permite cambiar el código MQTT, el motor asociado ni el estado
              automático. Los cambios de asociación deberán validarse en una etapa posterior.</p>
            <form className="admin-form" onSubmit={(event) => void submitEdit(event)}>
              <label>Nombre del gateway *
                <input required maxLength={150} value={editName}
                  onChange={(event) => setEditName(event.target.value)} />
              </label>
              <label>Conectividad
                <select value={editCommunication}
                  onChange={(event) => setEditCommunication(event.target.value as Communication)}>
                  {Object.entries(communicationLabels).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </label>
              <label>Número de serie
                <input maxLength={100} value={editSerial}
                  onChange={(event) => setEditSerial(event.target.value)} />
              </label>
              <label>Versión firmware
                <input maxLength={50} value={editFirmware}
                  onChange={(event) => setEditFirmware(event.target.value)} />
              </label>
              <button type="submit" disabled={busy}>{busy ? 'Guardando…' : 'Guardar cambios'}</button>
              <button className="refresh-button" type="button" onClick={() => setEditId(null)}>
                Cancelar
              </button>
            </form>
          </section>
        )}

        {isAdmin && (
          <section className="panel fleet-detail-panel">
            <div className="panel-heading"><h2>Registrar nuevo gateway</h2></div>
            <p className="admin-muted">Selecciona el motor de destino. La planta se asignará automáticamente
              desde el motor, sin introducir identificadores de empresa o planta.</p>
            <form className="admin-form" onSubmit={(event) => void submitCreate(event)}>
              <label>Motor de destino *
                <select required value={motorId} onChange={(event) => setMotorId(event.target.value)}>
                  <option value="">Seleccionar un motor</option>
                  {motors.filter((motor) => motor.status === 'ACTIVE').map((motor) => (
                    <option key={motor.id} value={motor.id}>
                      {motor.clientName} · {motor.plantName} · {motor.name} ({motor.code})
                    </option>
                  ))}
                </select>
              </label>
              <label>Nombre *
                <input required minLength={1} maxLength={150} value={name}
                  onChange={(event) => setName(event.target.value)} placeholder="ESP32 de ensayo" />
              </label>
              <label>Código MQTT único *
                <input required minLength={3} maxLength={80} pattern="[A-Za-z0-9_-]+"
                  value={code} onChange={(event) => setCode(event.target.value)}
                  placeholder="ESP32-LAB-001" />
              </label>
              <label>Tipo de comunicación *
                <select value={communicationType}
                  onChange={(event) => setCommunicationType(event.target.value as Communication)}>
                  {Object.entries(communicationLabels).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </label>
              <label>Número de serie
                <input value={serialNumber} maxLength={100}
                  onChange={(event) => setSerialNumber(event.target.value)} />
              </label>
              <label>Firmware
                <input value={firmwareVersion} maxLength={50}
                  onChange={(event) => setFirmwareVersion(event.target.value)} />
              </label>
              <button type="submit" disabled={busy || motors.length === 0}>
                {busy ? 'Registrando…' : 'Registrar dispositivo'}
              </button>
            </form>
          </section>
        )}
      </section>
    </main>
  );
}
