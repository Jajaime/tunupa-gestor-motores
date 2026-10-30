import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import type { AccessTokenPayload } from '../auth/auth.types';
import { DevicesService } from './devices.service';
import { DeviceCommunicationType } from './dto/device.dto';

const admin = { sub: 'admin', role: 'ADMIN' } as AccessTokenPayload;
const operator = { sub: 'operator', role: 'OPERATOR' } as AccessTokenPayload;
const viewer = { sub: 'viewer', role: 'VIEWER' } as AccessTokenPayload;

const dto = {
  motorId: '00000000-0000-4000-8000-000000000001',
  name: 'Gateway de prueba',
  code: 'ESP32-LAB-001',
  communicationType: DeviceCommunicationType.WIFI,
};

describe('DevicesService: inventario multiempresa y gestión administrativa', () => {
  const query =
    jest.fn<(sql: string, params?: unknown[]) => Promise<unknown[]>>();
  const service = new DevicesService({ query } as never);
  const calls = () =>
    query.mock.calls as unknown as Array<[string, unknown[]?]>;

  beforeEach(() => query.mockReset());

  it('filtra inventario por asignación vigente del usuario', async () => {
    query.mockResolvedValueOnce([]);
    await expect(service.list(viewer)).resolves.toEqual([]);
    expect(calls()[0][0]).toContain('uca.user_id = $2::uuid');
    expect(calls()[0][0]).toContain("c.status = 'ACTIVE'");
    expect(calls()[0][1]).toEqual(['VIEWER', 'viewer']);
  });

  it('los administradores consultan todo el inventario', async () => {
    query.mockResolvedValueOnce([]);
    await service.list(admin);
    expect(calls()[0][0]).toContain("$1::text = 'ADMIN'");
    expect(calls()[0][1]).toEqual(['ADMIN', 'admin']);
  });

  it('el detalle ajeno se responde como 404', async () => {
    query.mockResolvedValueOnce([]);
    await expect(service.detail(dto.motorId, operator)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(calls()[0][1]).toEqual(['OPERATOR', 'operator', dto.motorId]);
  });

  it('VIEWER y OPERATOR no pueden registrar dispositivos', async () => {
    await expect(service.create(dto, viewer)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(service.create(dto, operator)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(query).not.toHaveBeenCalled();
  });

  it('ADMIN registra el dispositivo usando plant_id del motor y estado REGISTERED', async () => {
    query.mockResolvedValueOnce([{ id: 'dev-1' }]);
    query.mockResolvedValueOnce([
      { id: 'dev-1', lastConnectionAt: null, lastTelemetryReceivedAt: null },
    ]);
    const created = await service.create(dto, admin);
    expect(created.id).toBe('dev-1');
    expect(calls()[0][0]).toContain('SELECT m.plant_id, m.id');
    expect(calls()[0][0]).toContain("'REGISTERED'");
    expect(calls()[0][1]).toEqual([
      dto.motorId,
      dto.name,
      dto.code,
      null,
      null,
      'WIFI',
    ]);
  });

  it('no registra si el motor activo no existe', async () => {
    query.mockResolvedValueOnce([]);
    await expect(service.create(dto, admin)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('traducir duplicados únicos a HTTP 409', async () => {
    query.mockRejectedValueOnce(
      new QueryFailedError('INSERT', [], { code: '23505' }),
    );
    await expect(service.create(dto, admin)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('el operador no modifica metadatos de un dispositivo', async () => {
    await expect(
      service.update(dto.motorId, { name: 'Otro' }, operator),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(query).not.toHaveBeenCalled();
  });

  it('no permite actualización vacía', async () => {
    await expect(service.update(dto.motorId, {}, admin)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('edita solo metadatos; preserva código, motor y estado', async () => {
    query.mockResolvedValueOnce([{ id: 'dev-1' }]);
    query.mockResolvedValueOnce([
      { id: 'dev-1', lastConnectionAt: null, lastTelemetryReceivedAt: null },
    ]);
    await service.update(
      'dev-1',
      { firmwareVersion: '1.0.2', serialNumber: null },
      admin,
    );
    const sql = calls()[0][0];
    expect(sql).toContain('firmware_version = CASE');
    expect(sql).not.toContain('device_code =');
    expect(sql).not.toContain('motor_id =');
    expect(sql).not.toContain('status =');
    expect(calls()[0][1]).toEqual([
      'dev-1',
      null,
      true,
      null,
      true,
      '1.0.2',
      null,
    ]);
  });
});
