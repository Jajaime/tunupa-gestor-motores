'use client';

import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import Link from 'next/link';
import { AppSidebar } from '@/components/layout/app-sidebar';
import { useAuth } from '@/components/auth/auth-provider';
import {
  createAdminMotor, getAdminClient, getAdminClients, getAdminMotor, updateAdminMotor,
} from '@/lib/api';
import type { AdminClientDetail, AdminClientSummary, AdminMotorStatus, CreateAdminMotor } from '@/lib/api';
import {
  adminMotorFormFromRecord, buildAdminMotorPayload, emptyAdminMotorForm,
} from '@/lib/admin-motor-form';
import type { AdminMotorForm } from '@/lib/admin-motor-form';
import { motorStates, motorTone } from '@/components/motors/motor-labels';

const registrationStatuses: Record<AdminMotorStatus, string> = {
  ACTIVE: 'Activo',
  INACTIVE: 'Inactivo',
  MAINTENANCE: 'En mantenimiento',
  OUT_OF_SERVICE: 'Fuera de servicio',
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'No fue posible completar la operación.';
}

export function MotorsAdmin() {
  const { user, signOut } = useAuth();
  const [clients, setClients] = useState<AdminClientSummary[]>([]);
  const [selectedClientId, setSelectedClientId] = useState('');
  const [detail, setDetail] = useState<AdminClientDetail | null>(null);
  const [plantFilter, setPlantFilter] = useState('ALL');
  const [form, setForm] = useState<AdminMotorForm>({ ...emptyAdminMotorForm });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (user?.role !== 'ADMIN') return;
    let alive = true;
    void getAdminClients().then((rows) => {
      if (!alive) return;
      setClients(rows);
      setSelectedClientId((previous) => rows.some((row) => row.id === previous)
        ? previous : (rows.find((row) => row.status === 'ACTIVE')?.id ?? rows[0]?.id ?? ''));
    }).catch((failure: unknown) => {
      if (alive) setError(errorMessage(failure));
    }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [user?.role, revision]);

  useEffect(() => {
    if (!selectedClientId || user?.role !== 'ADMIN') {
      return;
    }
    let alive = true;
    // changeClient() ya limpia el detalle al cambiar de empresa.
    // Evitar actualizaciones sincrónicas de estado dentro de useEffect.
    void getAdminClient(selectedClientId).then((record) => {
      if (!alive) return;
      setDetail(record);
      setForm((previous) => ({
        ...previous,
        plantId: record.plants.some((plant) => plant.id === previous.plantId && plant.status === 'ACTIVE')
          ? previous.plantId : (record.plants.find((plant) => plant.status === 'ACTIVE')?.id ?? ''),
      }));
    }).catch((failure: unknown) => {
      if (alive) setError(errorMessage(failure));
    });
    return () => { alive = false; };
  }, [selectedClientId, user?.role, revision]);

  const filteredMotors = useMemo(() => (detail?.motors ?? []).filter((motor) =>
    plantFilter === 'ALL' || motor.plantId === plantFilter), [detail, plantFilter]);

  function updateField<K extends keyof AdminMotorForm>(key: K, value: AdminMotorForm[K]) {
    setForm((previous) => ({ ...previous, [key]: value }));
  }

  function resetForm() {
    setEditingId(null);
    setForm({ ...emptyAdminMotorForm, plantId: detail?.plants.find((plant) => plant.status === 'ACTIVE')?.id ?? '' });
  }

  function changeClient(id: string) {
    setSelectedClientId(id);
    setPlantFilter('ALL');
    setDetail(null);
    setEditingId(null);
    setForm({ ...emptyAdminMotorForm });
    setError(''); setNotice('');
  }

  async function editMotor(id: string) {
    if (busy || user?.role !== 'ADMIN' || !detail?.motors.some((motor) => motor.id === id)) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const record = await getAdminMotor(id);
      // El endpoint es ADMIN-only. Además, mantenemos la selección de empresa de la pantalla.
      if (!detail.motors.some((motor) => motor.id === record.id && motor.plantId === record.plantId)) {
        throw new Error('El motor ya no pertenece a la empresa seleccionada. Actualiza el inventario.');
      }
      setEditingId(record.id);
      setForm(adminMotorFormFromRecord(record));
    } catch (failure) { setError(errorMessage(failure)); }
    finally { setBusy(false); }
  }

  async function submitMotor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || user?.role !== 'ADMIN' || !detail) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const payload = buildAdminMotorPayload(form);
      if (editingId) {
        await updateAdminMotor(editingId, payload);
        setNotice('Motor actualizado correctamente.');
      } else {
        const plant = detail.plants.find((item) => item.id === form.plantId && item.status === 'ACTIVE');
        if (detail.client.status !== 'ACTIVE' || !plant) {
          throw new Error('Selecciona una empresa y una planta activas para registrar el motor.');
        }
        const create: CreateAdminMotor = { ...payload, plantId: plant.id };
        await createAdminMotor(create);
        setNotice('Motor registrado correctamente.');
      }
      resetForm();
      setRevision((previous) => previous + 1);
    } catch (failure) { setError(errorMessage(failure)); }
    finally { setBusy(false); }
  }

  if (user?.role !== 'ADMIN') {
    return (
      <main className="auth-screen">
        <section className="auth-card" role="alert">
          <h1>Acceso restringido</h1>
          <p>La gestión de motores está reservada a administración TUNUPA.</p>
          <Link href="/">Volver al panel</Link>
        </section>
      </main>
    );
  }

  const activePlants = detail?.plants.filter((plant) => plant.status === 'ACTIVE') ?? [];
  const canCreate = detail?.client.status === 'ACTIVE' && activePlants.length > 0;

  return (
    <main className="app-shell">
      <AppSidebar role={user.role} />
      <section className="content tunupa-motors-admin">
        <header className="topbar">
          <div>
            <span className="eyebrow">ADMINISTRACIÓN TUNUPA DATA</span>
            <h1>Gestión de motores</h1>
            <p>Registra y edita motores asociados a las plantas de cada empresa.</p>
          </div>
          <div className="session-actions">
            <span className="session-user">{user.displayName ?? user.email}</span>
            <div>
              <button className="refresh-button" type="button" disabled={busy}
                onClick={() => { setError(''); setRevision((previous) => previous + 1); }}>Actualizar</button>
              <button className="refresh-button" type="button" onClick={() => void signOut()}>Cerrar sesión</button>
            </div>
          </div>
        </header>

        {error && <p className="admin-feedback" role="alert">{error}</p>}
        {notice && <p className="admin-feedback" role="status">{notice}</p>}

        <div className="fleet-toolbar tunupa-motors-admin-filters">
          <label>Empresa
            <select value={selectedClientId} disabled={busy || loading}
              onChange={(event) => changeClient(event.target.value)}>
              <option value="">Seleccionar empresa</option>
              {clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
            </select>
          </label>
          <label>Filtrar por planta
            <select value={plantFilter} disabled={!detail || busy}
              onChange={(event) => setPlantFilter(event.target.value)}>
              <option value="ALL">Todas las plantas</option>
              {detail?.plants.map((plant) => <option key={plant.id} value={plant.id}>{plant.name}</option>)}
            </select>
          </label>
        </div>

        <section className="panel fleet-panel" aria-label="Inventario administrativo de motores">
          <div className="panel-heading">
            <div><span className="eyebrow">INVENTARIO</span><h2>Motores registrados</h2></div>
            <span>{filteredMotors.length} equipos</span>
          </div>
          {!selectedClientId ? <p className="fleet-empty">{loading ? 'Cargando empresas…' : 'Registra o selecciona una empresa en Clientes.'}</p>
            : !detail ? <p className="fleet-empty">Cargando inventario de la empresa…</p>
              : filteredMotors.length === 0 ? <p className="fleet-empty">No hay motores registrados en esta selección.</p>
                : (
                  <div className="fleet-table-wrap">
                    <table className="fleet-table">
                      <thead><tr><th>Motor</th><th>Planta</th><th>Registro</th><th>Condición</th><th>Acciones</th></tr></thead>
                      <tbody>{filteredMotors.map((motor) => (
                        <tr key={motor.id}>
                          <td><strong>{motor.name}</strong><small>{motor.code}</small></td>
                          <td>{detail.plants.find((plant) => plant.id === motor.plantId)?.name ?? 'Sin planta'}</td>
                          <td>{registrationStatuses[motor.status as AdminMotorStatus] ?? motor.status}</td>
                          <td><span className={`status-pill ${motorTone(motor.operationalStatus)}`}>
                            {motorStates[motor.operationalStatus] ?? motor.operationalStatus}</span></td>
                          <td className="tunupa-motors-admin-actions">
                            <button className="refresh-button" type="button" disabled={busy}
                              onClick={() => void editMotor(motor.id)}>Editar</button>
                            <Link className="fleet-link" href={`/motors/${motor.id}`}>Ver ficha</Link>
                          </td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>
                )}
        </section>

        {detail && (
          <section className="panel fleet-detail-panel" aria-label={editingId ? 'Editar motor' : 'Registrar motor'}>
            <div className="panel-heading">
              <div><span className="eyebrow">{editingId ? 'EDICIÓN' : 'REGISTRO'}</span>
                <h2>{editingId ? 'Editar motor' : 'Registrar nuevo motor'}</h2></div>
              {editingId && <button className="refresh-button" type="button" disabled={busy} onClick={resetForm}>Cancelar edición</button>}
            </div>
            {!editingId && !canCreate && <p className="fleet-empty" role="status">
              Para registrar un motor, la empresa debe estar activa y tener una planta activa.
            </p>}
            <form className="admin-form tunupa-motor-form" onSubmit={(event) => void submitMotor(event)}>
              <label>Planta de pertenencia *
                <select required value={form.plantId} disabled={busy || Boolean(editingId)}
                  onChange={(event) => updateField('plantId', event.target.value)}>
                  <option value="">Seleccionar planta</option>
                  {(editingId ? detail.plants : activePlants).map((plant) => (
                    <option key={plant.id} value={plant.id}>{plant.name} · {plant.code}</option>
                  ))}
                </select>
              </label>
              <label>Nombre del motor *
                <input required maxLength={150} disabled={busy} value={form.name}
                  onChange={(event) => updateField('name', event.target.value)} placeholder="Bomba centrífuga principal" />
              </label>
              <label>Código del motor *
                <input required maxLength={50} disabled={busy} value={form.code}
                  onChange={(event) => updateField('code', event.target.value)} placeholder="MOTOR-001" />
              </label>
              <label>Estado administrativo
                <select value={form.status} disabled={busy}
                  onChange={(event) => updateField('status', event.target.value as AdminMotorStatus)}>
                  {Object.entries(registrationStatuses).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </label>
              <label>Fabricante
                <input maxLength={100} disabled={busy} value={form.manufacturer}
                  onChange={(event) => updateField('manufacturer', event.target.value)} placeholder="WEG" />
              </label>
              <label>Modelo
                <input maxLength={100} disabled={busy} value={form.model}
                  onChange={(event) => updateField('model', event.target.value)} placeholder="W22" />
              </label>
              <label>Número de serie
                <input maxLength={100} disabled={busy} value={form.serialNumber}
                  onChange={(event) => updateField('serialNumber', event.target.value)} />
              </label>
              <label>Potencia nominal (kW)
                <input type="number" min="0.001" step="0.001" disabled={busy} value={form.ratedPowerKw}
                  onChange={(event) => updateField('ratedPowerKw', event.target.value)} placeholder="0.373" />
              </label>
              <label>Voltaje nominal (V)
                <input type="number" min="0.001" step="0.001" disabled={busy} value={form.ratedVoltage}
                  onChange={(event) => updateField('ratedVoltage', event.target.value)} placeholder="220" />
              </label>
              <label>Corriente nominal (A)
                <input type="number" min="0.001" step="0.001" disabled={busy} value={form.ratedCurrent}
                  onChange={(event) => updateField('ratedCurrent', event.target.value)} placeholder="2.5" />
              </label>
              <label>Frecuencia nominal (Hz)
                <input type="number" min="0.001" step="0.001" disabled={busy} value={form.ratedFrequencyHz}
                  onChange={(event) => updateField('ratedFrequencyHz', event.target.value)} placeholder="50" />
              </label>
              <div className="tunupa-motor-form-footer admin-form-full">
                <small>Valores positivos y hasta 3 decimales. La planta no se modifica después del registro.</small>
                <button type="submit" disabled={busy || (!editingId && !canCreate)}>
                  {busy ? 'Guardando…' : editingId ? 'Guardar cambios' : 'Registrar motor'}
                </button>
              </div>
            </form>
          </section>
        )}
      </section>
    </main>
  );
}
