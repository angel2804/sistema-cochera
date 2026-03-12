// clientes.js — Gestión de clientes
const Clientes = {
  async buscarPorPlaca(placa) {
    if (!placa || placa.length < 3) return null;
    const snap = await db.collection('clientes')
      .where('placas', 'array-contains', placa.toUpperCase())
      .limit(1).get();
    if (snap.empty) return null;
    return { id: snap.docs[0].id, ...snap.docs[0].data() };
  },

  async getAll() {
    const snap = await db.collection('clientes').get();
    const lista = [];
    snap.forEach(d => lista.push({ id: d.id, ...d.data() }));
    lista.sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));
    return lista;
  },

  async add(data) {
    data.placas = (data.placas || []).map(p => p.toUpperCase().trim()).filter(Boolean);
    data.creadoEn = new Date();
    const ref = await db.collection('clientes').add(data);
    return { id: ref.id, ...data };
  },

  async update(id, data) {
    if (data.placas) data.placas = data.placas.map(p => p.toUpperCase().trim()).filter(Boolean);
    await db.collection('clientes').doc(id).update(data);
  },

  async delete(id) {
    await db.collection('clientes').doc(id).delete();
  },

  async agregarPlacaAuto(placa, nombre, celular) {
    placa = placa.toUpperCase().trim();
    const existe = await this.buscarPorPlaca(placa);
    if (existe) return; // ya está registrada esta placa
    if (!nombre) return;
    // Buscar cliente por celular
    if (celular) {
      const snap = await db.collection('clientes').where('celular', '==', celular).limit(1).get();
      if (!snap.empty) {
        const doc = snap.docs[0];
        const placas = doc.data().placas || [];
        if (!placas.includes(placa)) {
          await db.collection('clientes').doc(doc.id).update({ placas: [...placas, placa] });
        }
        return;
      }
    }
    await this.add({ nombre, celular: celular || '', placas: [placa] });
  }
};
