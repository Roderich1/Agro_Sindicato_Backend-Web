# Revisión local del cierre y de la gestión institucional

## Preparar el entorno

1. Use una base PostgreSQL desechable y cuentas sintéticas de un mismo sindicato. Prepare un segundo sindicato con sus propias cuentas para comprobar el aislamiento.
2. Desde `Back`, instale las dependencias con `npm ci`, genere el cliente con `npm run prisma:generate` y aplique `npx prisma migrate deploy` contra esa base. Configure firmas de sesión y Sync v1 en el entorno local. Use `npm run start:dev` para iniciar la API.
3. Desde `Web`, instale con `npm ci`. Ajuste `VITE_API_PROXY_TARGET` al origen de la API local e inicie con `npm run dev`.
4. En un emulador separado, ejecute Mobile con un origen HTTPS de pruebas válido mediante `--dart-define=AGRO_API_BASE_URL=<origen>`. Configure la confianza del certificado de pruebas en el entorno de depuración. Active una cuenta sintética y vincule una campaña y un producto.

## Recorrer los flujos

- Publique consumo y necesidad declarada desde Mobile. En Resumen compruebe la cantidad, su unidad y el aporte explícito de cero. Compare la pantalla con su Excel.
- Cree una convocatoria como Directiva. Entre como Administración, edite y ábrala. Envíe una participación desde Mobile con la autorización de Administración. Compruebe el detalle en Administración y los agregados en Directiva. Cierre o cancele desde un usuario institucional distinto del creador.
- Prepare un envío en el emulador y desconecte la red de ese emulador. En la Web abra el diálogo **Cerrar campaña** y revise la cobertura. Confirme, reconecte el emulador y abra el estado de los envíos. La app explica que el cierre impide publicar nuevos valores y mantiene el registro privado.
- En la Web revise el Histórico de campañas por tipo, campaña y producto, y descargue el Excel con los mismos filtros. Luego clasifique la campaña en una temporada y consulte Estimación. Un retiro de autorización deja su cifra histórica sin dato.

Para recuperar campañas cerradas antes del cierre atómico, siga el procedimiento de [regularización local](../architecture/CIERRE_Y_GESTION_INSTITUCIONAL.md#regularización-local-de-campañas-anteriores).
