// vehiculos.js — Registro de entradas y salidas de vehículos
const TIPOS_VEHICULO = [
  'Auto', 'Moto', 'Camioneta', 'Cisterna',
  'Tráiler', 'Volquete', 'Bus', 'Otro'
];

const Vehiculos = {

  // ── Referencias de configuración ────────────────────────────────────────────
  _ref: {
    ticket:    () => db.collection('configuracion').doc('ticket'),
    general:   () => db.collection('configuracion').doc('general'),
    ocupacion: () => db.collection('configuracion').doc('ocupacion'),
    lock:   (placa) => db.collection('autos_activos').doc(placa),
  },

  // ── Sincronizar contador de ocupación (llamar desde panel admin si hay
  // desincronización, por ejemplo tras migrar datos manualmente) ────────────────
  async sincronizarContador() {
    const snap = await db.collection('autos')
      .where('estado', '==', 'dentro')
      .get();
    await this._ref.ocupacion().set({ count: snap.size });
  },

  // ── Registrar Entrada ────────────────────────────────────────────────────────
  // Usa una única transacción Firestore que lee y escribe atómicamente:
  //   1. Lock doc por placa → previene duplicados aunque dos clientes registren
  //      la misma placa al mismo tiempo (TOCTOU prevention).
  //   2. Contador de ocupación → garantiza que nunca se supera `totalEspacios`,
  //      incluso con registros simultáneos.
  //   3. Ticket auto-incremental → sin duplicados de número de ticket.
  //   4. Documento `autos` → se crea en la misma transacción.
  async registrarEntrada(datos, turno, sesion) {
    const placa             = datos.placa.toUpperCase().trim();
    // Pre-registro puede pasar una fecha de ingreso anterior (horaEntrada en datos)
    const ahora             = datos.horaEntrada ? new Date(datos.horaEntrada) : new Date();
    const turnoId           = turno?.id || null;
    const turnoTrabajadorId = turno?.trabajadorId || sesion.id;
    const turnoTrabajador   = turno?.trabajador || sesion.nombre || sesion.usuario;
    const cobro             = datos.cobradoAlIngreso && datos.montoIngreso > 0;

    // ID pre-generado para poder referenciar el doc dentro de la transacción
    const autoRef   = db.collection('autos').doc();
    const lockRef   = this._ref.lock(placa);
    const ocupRef   = this._ref.ocupacion();
    const generalRef = this._ref.general();
    const ticketRef = this._ref.ticket();

    const docBase = {
      placa,
      tipo:               datos.tipo || 'Auto',
      clienteNombre:      datos.clienteNombre || 'Sin nombre',
      clienteCelular:     datos.clienteCelular || '',
      horaEntrada:        ahora,
      horaSalida:         null,
      estado:             'dentro',
      esPreRegistro:      datos.esPreRegistro || false,
      tarifaPactada:      parseFloat(datos.tarifaPactada) || 0,
      turnoEntradaId:     turnoId,
      trabajadorEntradaId: turnoTrabajadorId,
      trabajadorEntrada:  turnoTrabajador,
      cobradoAlIngreso:   cobro,
      montoIngreso:       cobro ? (parseFloat(datos.montoIngreso) || 0) : 0,
      turnoSalidaId:      null,
      trabajadorSalidaId: null,
      trabajadorSalida:   null,
      montoSalida:        0,
      precioTotal:        cobro ? (parseFloat(datos.montoIngreso) || 0) : 0,
      fecha:              ahora,
    };

    // Transacción atómica: todas las lecturas primero, luego todas las escrituras
    const ticketNum = await db.runTransaction(async t => {
      // ── Lecturas ────────────────────────────────────────────────────────────
      const lockSnap    = await t.get(lockRef);
      const ocupSnap    = await t.get(ocupRef);
      const generalSnap = await t.get(generalRef);
      const ticketSnap  = await t.get(ticketRef);

      // ── Validaciones ────────────────────────────────────────────────────────
      if (lockSnap.exists) {
        // Verificar que el lock no sea obsoleto (auto ya salió o fue borrado)
        const existingAutoId = lockSnap.data()?.autoId;
        if (existingAutoId) {
          const existingSnap = await t.get(
            db.collection('autos').doc(existingAutoId)
          );
          const estaAdentro =
            existingSnap.exists && existingSnap.data().estado === 'dentro';
          if (estaAdentro) throw new Error('duplicado');
          // Lock obsoleto → se sobreescribe abajo
        } else {
          throw new Error('duplicado'); // Sin autoId: tratar como activo
        }
      }

      const totalEspacios = generalSnap.exists
        ? (generalSnap.data().totalEspacios || 30)
        : 30;

      const ocupActual = ocupSnap.exists
        ? (ocupSnap.data().count || 0)
        : 0;

      if (ocupActual >= totalEspacios) {
        throw new Error('sin_espacio');
      }

      const numTicket = (ticketSnap.exists ? ticketSnap.data().ultimo : 0) + 1;

      // ── Escrituras atómicas ─────────────────────────────────────────────────
      // 1. Lock doc: bloquea futuras entradas de la misma placa hasta que salga
      t.set(lockRef, { placa, autoId: autoRef.id, horaEntrada: ahora });
      // 2. Contador de ocupación
      t.set(ocupRef, { count: ocupActual + 1 });
      // 3. Ticket auto-incremental
      t.set(ticketRef, { ultimo: numTicket });
      // 4. Documento del auto
      t.set(autoRef, { ...docBase, ticketNumero: numTicket });

      return numTicket;
    });

    const autoId = autoRef.id;

    // Cobro al ingreso — fuera de la transacción (es puramente aditivo,
    // no tiene riesgo de concurrencia)
    if (cobro && turnoId) {
      await db.collection('cobros').add({
        autoId,
        placa,
        clienteNombre:   docBase.clienteNombre,
        clienteCelular:  docBase.clienteCelular,
        tipo:            'ingreso',
        monto:           docBase.montoIngreso,
        turnoId,
        trabajadorId:    turnoTrabajadorId,
        trabajador:      turnoTrabajador,
        horaEntradaAuto: ahora,
        horaSalidaAuto:  null,
        fecha:           ahora,
        fechaCobro:      ahora,
      });
    }

    // Auto-registrar cliente en background (tolerante a fallos)
    if (datos.clienteNombre && placa) {
      Clientes
        .agregarPlacaAuto(placa, datos.clienteNombre, datos.clienteCelular)
        .catch(() => {});
    }

    return { id: autoId, ...docBase, ticketNumero: ticketNum };
  },

  // ── Registrar Salida ─────────────────────────────────────────────────────────
  // Transacción para:
  //   - Re-verificar estado (previene doble salida simultánea)
  //   - Decrementar contador de ocupación
  //   - Eliminar lock doc de la placa
  async registrarSalida(autoId, monto, turno, sesion, opciones = {}) {
    const autoDoc = await db.collection('autos').doc(autoId).get();
    if (!autoDoc.exists) throw new Error('no_encontrado');
    const auto = { id: autoDoc.id, ...autoDoc.data() };

    const ahora             = new Date();
    const turnoId           = turno?.id || null;
    const turnoTrabajadorId = turno?.trabajadorId || sesion.id;
    const turnoTrabajador   = turno?.trabajador || sesion.nombre || sesion.usuario;
    const montoSalida       = parseFloat(monto) || 0;
    const precioTotal       = (auto.montoIngreso || 0) + montoSalida;

    // Auditoría anti-fraude
    const montoCalculadoSistema = opciones.montoCalculadoSistema ?? montoSalida;
    const motivoModificacion    = opciones.motivoModificacion || null;
    const pagadoIngreso         = opciones.pagadoIngreso || 0;
    // saldoEsperado = costoTotal calculado - lo ya pagado al ingreso
    const saldoEsperado  = Math.max(0, montoCalculadoSistema - pagadoIngreso);
    const alertaAuditoria = Math.abs(montoSalida - saldoEsperado) > 0.01;

    const autoRef  = db.collection('autos').doc(autoId);
    const lockRef  = this._ref.lock(auto.placa);
    const ocupRef  = this._ref.ocupacion();

    await db.runTransaction(async t => {
      // Re-verificar dentro de la transacción para prevenir doble salida
      const autoSnap = await t.get(autoRef);
      const ocupSnap = await t.get(ocupRef);

      if (!autoSnap.exists || autoSnap.data().estado !== 'dentro') {
        throw new Error('ya_salio');
      }

      const ocupActual = ocupSnap.exists ? (ocupSnap.data().count || 0) : 0;

      t.update(autoRef, {
        horaSalida:         ahora,
        estado:             'salido',
        turnoSalidaId:      turnoId,
        trabajadorSalidaId: turnoTrabajadorId,
        trabajadorSalida:   turnoTrabajador,
        montoSalida,
        precioTotal,
      });
      t.delete(lockRef);
      t.set(ocupRef, { count: Math.max(0, ocupActual - 1) });
    });

    // Cobro de salida — fuera de transacción (puramente aditivo)
    if (turnoId) {
      await db.collection('cobros').add({
        autoId,
        placa:                  auto.placa,
        clienteNombre:          auto.clienteNombre,
        clienteCelular:         auto.clienteCelular,
        tipo:                   'salida',
        monto:                  montoSalida,
        montoCalculadoSistema,
        alertaAuditoria,
        motivoModificacion:     alertaAuditoria ? motivoModificacion : null,
        turnoId,
        trabajadorId:           turnoTrabajadorId,
        trabajador:             turnoTrabajador,
        horaEntradaAuto:        formatFecha(auto.horaEntrada),
        horaSalidaAuto:         ahora,
        fecha:                  ahora,
        fechaCobro:             ahora,
      });
    }

    return { ...auto, horaSalida: ahora, montoSalida, precioTotal };
  },

  // ── Anular Registro ──────────────────────────────────────────────────────────
  // NUNCA se borra un registro financiero. Anular cambia el estado a 'anulado'
  // y guarda quién y cuándo lo hizo (auditoría completa).
  // Solo aplica a registros con estado 'salido'. Un vehículo 'dentro' debe
  // procesarse primero con registrarSalida().
  async anularRegistro(id, sesion) {
    const autoDoc = await db.collection('autos').doc(id).get();
    if (!autoDoc.exists) throw new Error('no_encontrado');
    if (autoDoc.data().estado === 'anulado') throw new Error('ya_anulado');

    await db.collection('autos').doc(id).update({
      estado:       'anulado',
      anuladoEn:    new Date(),
      anuladoPor:   sesion.nombre || sesion.usuario,
      anuladoPorId: sesion.id,
    });
  },

  // ── Total de espacios configurados ──────────────────────────────────────────
  async getTotalEspacios() {
    const doc = await this._ref.general().get();
    return doc.exists ? (doc.data().totalEspacios || 30) : 30;
  },

  // ── Obtener vehículos actualmente en cochera ─────────────────────────────────
  async getEnCochera() {
    const snap = await db.collection('autos')
      .where('estado', '==', 'dentro')
      .get();
    const lista = [];
    snap.forEach(d => lista.push({ id: d.id, ...d.data() }));
    lista.sort(
      (a, b) => formatFecha(a.horaEntrada) - formatFecha(b.horaEntrada)
    );
    return lista;
  },

  async getById(id) {
    const doc = await db.collection('autos').doc(id).get();
    if (!doc.exists) return null;
    return { id: doc.id, ...doc.data() };
  }
};
