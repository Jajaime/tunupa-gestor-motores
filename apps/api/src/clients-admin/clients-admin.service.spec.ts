import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { ClientsAdminService } from './clients-admin.service';

describe('ClientsAdminService', () => {
  const query = jest.fn();
  const service = new ClientsAdminService({ query } as never);
  beforeEach(() => query.mockReset());

  it('lista empresas y sus conteos sin concatenar entradas externas', async () => {
    query.mockResolvedValueOnce([]);
    await expect(service.list()).resolves.toEqual([]);
    expect(query.mock.calls[0][0]).toContain('FROM public.clients c');
  });

  it('no permite registrar empresas con nombre en blanco', async () => {
    await expect(service.create({ name: '   ' })).rejects.toBeInstanceOf(BadRequestException);
    expect(query).not.toHaveBeenCalled();
  });

  it('no expone plantas de clientes inexistentes', async () => {
    query.mockResolvedValueOnce([]);
    await expect(service.detail('client-1')).rejects.toBeInstanceOf(NotFoundException);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('usa parámetros en detalle y filtra plantas y motores por client_id', async () => {
    query.mockResolvedValueOnce([{ id: 'client-1', name: 'Empresa A', status: 'ACTIVE' }]);
    query.mockResolvedValueOnce([]);
    query.mockResolvedValueOnce([]);
    await service.detail('client-1');
    expect(query.mock.calls[0][1]).toEqual(['client-1']);
    expect(query.mock.calls[1][0]).toContain('WHERE p.client_id = $1');
    expect(query.mock.calls[2][0]).toContain('WHERE p.client_id = $1');
    expect(query.mock.calls[2][1]).toEqual(['client-1']);
  });

  it('rechaza códigos de planta duplicados', async () => {
    query.mockResolvedValueOnce([{ id: 'client-1', status: 'ACTIVE' }]);
    query.mockRejectedValueOnce({ code: '23505' });
    await expect(service.createPlant('client-1', { name: 'Planta 1', code: 'A' }))
      .rejects.toBeInstanceOf(ConflictException);
  });
});
