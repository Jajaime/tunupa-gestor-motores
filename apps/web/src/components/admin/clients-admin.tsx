'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { FormEvent } from 'react';
import { AppSidebar } from '@/components/layout/app-sidebar';
import { useAuth } from '@/components/auth/auth-provider';
import {
  createAdminClient, createAdminPlant, getAdminClient, getAdminClients,
} from '@/lib/api';
import type { AdminClientDetail, AdminClientSummary } from '@/lib/api';

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'No se pudo completar la operación.';
}

export function ClientsAdmin() {
  const { user, signOut } = useAuth();
  const [clients, setClients] = useState<AdminClientSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AdminClientDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [name, setName] = useState('');
  const [taxId, setTaxId] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [plantName, setPlantName] = useState('');
  const [plantCode, setPlantCode] = useState('');
  const [plantLocation, setPlantLocation] = useState('');

  useEffect(() => {
    if (user?.role !== 'ADMIN') return;
    let alive = true;
    void getAdminClients().then((rows) => {
      if (!alive) return;
      setClients(rows);
      setSelectedId((previous) => previous && rows.some((row) => row.id === previous)
        ? previous : (rows[0]?.id ?? null));
    }).catch((failure: unknown) => {
      if (alive) setError(errorMessage(failure));
    }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [user?.role]);

  useEffect(() => {
    if (!selectedId || user?.role !== 'ADMIN') {
      return;
    }
    let alive = true;
    void getAdminClient(selectedId).then((result) => {
      if (alive) setDetail(result);
    }).catch((failure: unknown) => {
      if (alive) setError(errorMessage(failure));
    });
    return () => { alive = false; };
  }, [selectedId, user?.role]);

  async function submitClient(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const created = await createAdminClient({
        name: name.trim(), taxId: taxId.trim() || undefined,
        email: email.trim() || undefined, phone: phone.trim() || undefined,
      });
      setClients((previous) => [...previous, created].sort((a, b) => a.name.localeCompare(b.name, 'es')));
      setSelectedId(created.id);
      setName(''); setTaxId(''); setEmail(''); setPhone('');
      setNotice('Empresa registrada correctamente.');
    } catch (failure) { setError(errorMessage(failure)); }
    finally { setBusy(false); }
  }

  async function submitPlant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !selectedId) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await createAdminPlant(selectedId, {
        name: plantName.trim(), code: plantCode.trim(),
        location: plantLocation.trim() || undefined,
      });
      const refreshed = await getAdminClient(selectedId);
      setDetail(refreshed);
      setClients((previous) => previous.map((item) => item.id === selectedId ? refreshed.client : item));
      setPlantName(''); setPlantCode(''); setPlantLocation('');
      setNotice('Planta vinculada correctamente.');
    } catch (failure) { setError(errorMessage(failure)); }
    finally { setBusy(false); }
  }

  if (user?.role !== 'ADMIN') {
    return (
      <main className="auth-screen">
        <section className="auth-card" role="alert">
          <h1>Acceso restringido</h1>
          <p>La gestión de clientes está reservada a los administradores GroundTEK.</p>
          <Link href="/">Volver al panel</Link>
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <AppSidebar role={user.role} />
      <section className="content">
        <header className="admin-clients-header">
          <div>
            <span className="eyebrow">ADMINISTRACIÓN GROUNDTEK</span>
            <h1>Clientes</h1>
            <p>Registra empresas, vincula plantas y consulta sus motores.</p>
          </div>
          <button className="refresh-button" type="button" onClick={() => void signOut()}>Cerrar sesión</button>
        </header>

        {error && <p className="admin-feedback" role="alert">{error}</p>}
        {notice && <p className="admin-feedback" role="status">{notice}</p>}
        <section className="panel" aria-label="Registrar empresa">
          <div className="panel-heading"><h2>Nueva empresa</h2></div>
          <form className="admin-form" onSubmit={(event) => void submitClient(event)}>
            <label>Razón social o nombre *
              <input required maxLength={150} value={name} onChange={(event) => setName(event.target.value)} />
            </label>
            <label>RUT / identificador
              <input maxLength={30} value={taxId} onChange={(event) => setTaxId(event.target.value)} />
            </label>
            <label>Correo electrónico
              <input type="email" maxLength={255} value={email} onChange={(event) => setEmail(event.target.value)} />
            </label>
            <label>Teléfono
              <input maxLength={30} value={phone} onChange={(event) => setPhone(event.target.value)} />
            </label>
            <button type="submit" disabled={busy}>{busy ? 'Guardando…' : 'Registrar empresa'}</button>
          </form>
        </section>

        <div className="admin-clients-grid">
          <section className="panel" aria-label="Empresas registradas">
            <div className="panel-heading"><h2>Empresas</h2><span>{clients.length}</span></div>
            {loading ? <p className="admin-clients-list admin-muted">Cargando empresas…</p>
              : clients.length === 0 ? <p className="admin-clients-list admin-muted">No hay empresas registradas.</p>
                : (
                  <div className="admin-clients-list">
                    {clients.map((client) => (
                      <button key={client.id} type="button" className="admin-client-item"
                        aria-pressed={selectedId === client.id}
                        onClick={() => { setError(''); setNotice(''); setSelectedId(client.id); }}>
                        <strong>{client.name}</strong>
                        <small>{client.plantCount} plantas · {client.motorCount} motores</small>
                        {client.taxId && <small>{client.taxId}</small>}
                      </button>
                    ))}
                  </div>
                )}
          </section>
          <section className="panel admin-client-detail" aria-label="Detalle de empresa">
            {!selectedId ? <p className="admin-muted">Selecciona una empresa para consultar sus instalaciones.</p>
              : !detail || detail.client.id !== selectedId ? <p className="admin-muted">Cargando detalle…</p> : (
                <>
                  <h2>{detail.client.name}</h2>
                  <p className="admin-muted">{detail.client.email || 'Sin correo'} · {detail.client.status}</p>
                  <div className="admin-client-stats">
                    <span>{detail.plants.length} plantas</span>
                    <span>{detail.motors.length} motores</span>
                  </div>
                  <h3>Plantas registradas</h3>
                  {detail.plants.length === 0 ? <p className="admin-muted">Todavía no tiene plantas asociadas.</p> : (
                    <div className="admin-table-scroll">
                      <table className="admin-data-table">
                        <thead><tr><th>Planta</th><th>Código</th><th>Ubicación</th><th>Motores</th></tr></thead>
                        <tbody>{detail.plants.map((plant) => (
                          <tr key={plant.id}><td>{plant.name}</td><td>{plant.code}</td>
                            <td>{plant.location || '—'}</td><td>{plant.motorCount}</td></tr>
                        ))}</tbody>
                      </table>
                    </div>
                  )}
                  <h3>Agregar planta</h3>
                  <form className="admin-form" onSubmit={(event) => void submitPlant(event)}>
                    <label>Nombre *
                      <input required maxLength={150} value={plantName} onChange={(event) => setPlantName(event.target.value)} />
                    </label>
                    <label>Código *
                      <input required maxLength={50} value={plantCode} onChange={(event) => setPlantCode(event.target.value)} />
                    </label>
                    <label>Ubicación
                      <input maxLength={255} value={plantLocation} onChange={(event) => setPlantLocation(event.target.value)} />
                    </label>
                    <button type="submit" disabled={busy || detail.client.status !== 'ACTIVE'}>
                      {busy ? 'Guardando…' : 'Agregar planta'}
                    </button>
                  </form>
                  <h3>Motores asociados</h3>
                  {detail.motors.length === 0 ? <p className="admin-muted">No hay motores asociados a estas plantas.</p> : (
                    <div className="admin-table-scroll">
                      <table className="admin-data-table">
                        <thead><tr><th>Motor</th><th>Código</th><th>Estado</th><th>Operación</th></tr></thead>
                        <tbody>{detail.motors.map((motor) => (
                          <tr key={motor.id}><td>{motor.name}</td><td>{motor.code}</td>
                            <td>{motor.status}</td><td>{motor.operationalStatus}</td></tr>
                        ))}</tbody>
                      </table>
                    </div>
                  )}
                </>
              )}
          </section>
        </div>
      </section>
    </main>
  );
}
