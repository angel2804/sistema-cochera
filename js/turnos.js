// turnos.js — Gestión de turnos de trabajo
const Turnos = {
  TIPOS: ['Mañana', 'Tarde', 'Noche', 'Todo el día'],

  async getActivo() {
    // Query simple: solo where estado==activo, limit 1
    const snap = await db.collection('turnos').where('estado', '==', 'activo').limit(1).get();
    if (snap.empty) return null;
    return { id: snap.docs[0].id, ...snap.docs[0].data() };
  },

  async getActivoDelTrabajador(trabajadorId) {
    // Dos equality where — permitido en Firestore sin índice compuesto especial
    const snap = await db.collection('turnos')
      .where('trabajadorId', '==', trabajadorId)
      .where('estado', '==', 'activo')
      .limit(1).get();
    if (snap.empty) return null;
    return { id: snap.docs[0].id, ...snap.docs[0].data() };
  },

  async iniciar(tipo, sesion) {
    // Verificar que no haya turno activo global
    const activo = await this.getActivo();
    if (activo && activo.trabajadorId !== sesion.id) throw new Error('ya_hay_turno');
    if (activo && activo.trabajadorId === sesion.id) return activo;

    const data = {
      trabajadorId: sesion.id,
      trabajador: sesion.nombre || sesion.usuario,
      tipo,
      inicio: new Date(),
      fin: null,
      estado: 'activo',
      fecha: new Date()
    };
    const ref = await db.collection('turnos').add(data);
    return { id: ref.id, ...data };
  },

  async cerrar(turnoId, arqueo) {
    const update = { fin: new Date(), estado: 'cerrado' };
    if (arqueo) {
      update.arqueoEfectivo   = arqueo.efectivoEntregado || 0;
      update.arqueoEsperado   = arqueo.totalEsperado     || 0;
      update.arqueoDiferencia = arqueo.diferencia        || 0;
    }
    await db.collection('turnos').doc(turnoId).update(update);
  },

  async getById(id) {
    const doc = await db.collection('turnos').doc(id).get();
    if (!doc.exists) return null;
    return { id: doc.id, ...doc.data() };
  },

  async getTodos() {
    const snap = await db.collection('turnos').limit(200).get();
    const lista = [];
    snap.forEach(d => lista.push({ id: d.id, ...d.data() }));
    // Ordenar client-side
    lista.sort((a, b) => formatFecha(b.inicio) - formatFecha(a.inicio));
    return lista;
  }
};
