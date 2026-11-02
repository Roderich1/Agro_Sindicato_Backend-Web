import { describe, expect, it } from 'vitest';
import { COLLECTIVE_PATHS, menuGroupsFor, menuPathsFor } from './navigation';

describe('Menú de la Directiva y del Administrador (bloque de experiencia 2026-10-30)', () => {
  it('la Bitácora está en el menú de los dos roles que ya la tenían permitida; Usuarios sólo del Administrador', () => {
    expect(menuPathsFor('DIRECTIVA')).toContain('/audit-logs');
    expect(menuPathsFor('DIRECTIVA')).not.toContain('/users');
    expect(menuPathsFor('ADMINISTRADOR')).toContain('/audit-logs');
    expect(menuPathsFor('ADMINISTRADOR')).toContain('/users');
  });

  it('el Calendario sigue fuera del menú institucional (su GET crea eventos)', () => {
    expect(menuPathsFor('DIRECTIVA')).not.toContain('/calendar');
    expect(menuPathsFor('ADMINISTRADOR')).not.toContain('/calendar');
  });

  it('agrupa por tarea y no pierde ningún camino del menú', () => {
    const groups = menuGroupsFor('ADMINISTRADOR');
    expect(groups.map((g) => g.title)).toEqual([
      'Resumen',
      'Necesidades y propuestas',
      'Histórico y tendencias',
      'Equivalencias',
      'Administración',
    ]);
    expect(groups.flatMap((g) => [...g.paths])).toEqual([...menuPathsFor('ADMINISTRADOR')]);
    expect(groups[0].paths).toEqual([COLLECTIVE_PATHS.summary, COLLECTIVE_PATHS.coverage]);
    expect(groups[4].paths).toEqual(['/campaigns', '/users', '/audit-logs']);
  });

  it('un agricultor sin el flag legacy no tiene menú', () => {
    expect(menuPathsFor('AGRICULTOR')).toEqual([]);
    expect(menuGroupsFor('AGRICULTOR')).toEqual([]);
    expect(menuGroupsFor(null)).toEqual([]);
  });
});
