// reportes.js — Generación y consulta de reportes por turno
const Reportes = {

  // ── Ticket individual (reimpresión) ─────────────────────────────────────────
  // Genera HTML de recibo para un solo vehículo. Compatible con window.print().
  generarHTMLTicket(auto) {
    const entrada  = formatFecha(auto.horaEntrada);
    const salida   = auto.horaSalida ? formatFecha(auto.horaSalida) : null;
    const fmtFull  = {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    };
    const entStr   = entrada.toLocaleString('es-PE', fmtFull);
    const salStr   = salida ? salida.toLocaleString('es-PE', fmtFull) : '(en cochera)';
    const tiempo   = salida
      ? calcularTiempoEntre(auto.horaEntrada, auto.horaSalida)
      : calcularTiempo(auto.horaEntrada);
    const total    = (auto.precioTotal || 0).toFixed(2);
    const ingreso  = (auto.montoIngreso || 0).toFixed(2);
    const salidaM  = (auto.montoSalida  || 0).toFixed(2);

    return `
      <div class="ticket-wrap">
        <div class="ticket-encabezado">
          <div class="ticket-logo">🏎️ COCHERA POS</div>
          <div class="ticket-num">Ticket N° ${auto.ticketNumero || '—'}</div>
        </div>
        <div class="ticket-sep">· · · · · · · · · · · · · · · · · · · ·</div>
        <div class="ticket-placa-grande">${auto.placa}</div>
        <div class="ticket-filas">
          <div class="ticket-fila">
            <span class="ticket-lbl">Tipo</span>
            <span class="ticket-val">${auto.tipo || '—'}</span>
          </div>
          <div class="ticket-fila">
            <span class="ticket-lbl">Cliente</span>
            <span class="ticket-val">${auto.clienteNombre || '—'}</span>
          </div>
          <div class="ticket-fila">
            <span class="ticket-lbl">Entrada</span>
            <span class="ticket-val ticket-mono">${entStr}</span>
          </div>
          <div class="ticket-fila">
            <span class="ticket-lbl">Salida</span>
            <span class="ticket-val ticket-mono">${salStr}</span>
          </div>
          <div class="ticket-fila">
            <span class="ticket-lbl">Tiempo</span>
            <span class="ticket-val">${tiempo}</span>
          </div>
          <div class="ticket-fila">
            <span class="ticket-lbl">Operador</span>
            <span class="ticket-val">${auto.trabajadorEntrada || '—'}</span>
          </div>
          <div class="ticket-fila">
            <span class="ticket-lbl">Cobro ingreso</span>
            <span class="ticket-val">S/ ${ingreso}</span>
          </div>
          <div class="ticket-fila">
            <span class="ticket-lbl">Cobro salida</span>
            <span class="ticket-val">S/ ${salidaM}</span>
          </div>
        </div>
        <div class="ticket-sep">· · · · · · · · · · · · · · · · · · · ·</div>
        <div class="ticket-total-fila">
          <span class="ticket-total-lbl">TOTAL</span>
          <span class="ticket-total-val">S/ ${total}</span>
        </div>
        <div class="ticket-pie">Gracias por su visita — COCHERA POS</div>
      </div>
    `;
  },


  async getByTurno(turnoId) {
    const snap = await db.collection('cobros').where('turnoId', '==', turnoId).get();
    const lista = [];
    snap.forEach(d => lista.push({ id: d.id, ...d.data() }));
    // Ordenar client-side por fecha de cobro
    lista.sort((a, b) => formatFecha(a.fechaCobro) - formatFecha(b.fechaCobro));
    return lista;
  },

  calcularTotal(cobros) {
    return cobros.reduce((s, c) => s + (c.monto || 0), 0);
  },

  // ── Genera el HTML del reporte incluyendo sección de arqueo opcional ──────
  generarHTMLReporte(cobros, turno, arqueo) {
    const totalCobros = this.calcularTotal(cobros);
    const inicio = formatFecha(turno.inicio);
    const fin    = turno.fin ? formatFecha(turno.fin) : null;
    const fmt    = { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' };

    const totalIngresos = cobros
      .filter(c => c.tipo === 'ingreso')
      .reduce((s, c) => s + (c.monto || 0), 0);
    const totalSalidas  = cobros
      .filter(c => c.tipo === 'salida')
      .reduce((s, c) => s + (c.monto || 0), 0);

    const filas = cobros.map(c => {
      const ent = formatFecha(c.horaEntradaAuto);
      const sal = c.horaSalidaAuto ? formatFecha(c.horaSalidaAuto) : null;
      const tipoBg    = c.tipo === 'ingreso' ? '#00d4aa22' : '#f9ca2422';
      const tipoColor = c.tipo === 'ingreso' ? '#00d4aa'   : '#f9ca24';
      return `
        <tr>
          <td style="font-family:monospace;font-weight:700;letter-spacing:2px">
            ${c.placa}
          </td>
          <td>${c.clienteNombre || '-'}</td>
          <td>${c.clienteCelular || '-'}</td>
          <td>
            <span style="padding:3px 8px;border-radius:4px;font-size:0.75rem;
              font-weight:700;background:${tipoBg};color:${tipoColor}">
              ${c.tipo === 'ingreso' ? 'Ingreso' : 'Salida'}
            </span>
          </td>
          <td>${ent.toLocaleString('es-PE', fmt)}</td>
          <td>${sal ? sal.toLocaleString('es-PE', fmt) : '-'}</td>
          <td style="font-weight:700;color:#00d4aa">
            S/ ${(c.monto || 0).toFixed(2)}
          </td>
        </tr>`;
    }).join('');

    // Sección de arqueo (opcional — sólo al cerrar turno)
    const htmlArqueo = arqueo ? `
      <div style="margin-top:20px;padding:16px;background:#161b27;border-radius:12px;
        border:1px solid #334060">
        <div style="font-size:0.68rem;font-weight:800;letter-spacing:2px;
          text-transform:uppercase;color:#5a6f8a;margin-bottom:12px">
          📊 Arqueo de Caja
        </div>
        <table style="width:100%;border-collapse:collapse;font-size:0.82rem">
          <tr>
            <td style="padding:5px 0;color:#8fa3c0">Cobros al ingreso</td>
            <td style="text-align:right;font-family:monospace;font-weight:700;
              color:#e8edf5">S/ ${totalIngresos.toFixed(2)}</td>
          </tr>
          <tr>
            <td style="padding:5px 0;color:#8fa3c0">Cobros a la salida</td>
            <td style="text-align:right;font-family:monospace;font-weight:700;
              color:#e8edf5">S/ ${totalSalidas.toFixed(2)}</td>
          </tr>
          <tr>
            <td style="padding:5px 0;color:#8fa3c0">Total esperado</td>
            <td style="text-align:right;font-family:monospace;font-weight:700;
              color:#00d4aa">S/ ${(arqueo.totalEsperado || 0).toFixed(2)}</td>
          </tr>
          <tr>
            <td style="padding:5px 0;color:#8fa3c0">Efectivo entregado</td>
            <td style="text-align:right;font-family:monospace;font-weight:700;
              color:#f9ca24">S/ ${(arqueo.efectivoEntregado || 0).toFixed(2)}</td>
          </tr>
          <tr style="border-top:1px solid #334060">
            <td style="padding:8px 0 5px;font-weight:800;color:#8fa3c0">Diferencia</td>
            <td style="text-align:right;font-family:monospace;font-size:1rem;
              font-weight:700;padding:8px 0 5px;
              color:${(arqueo.diferencia || 0) >= 0 ? '#00d4aa' : '#ff4757'}">
              ${(arqueo.diferencia || 0) >= 0
                ? '+S/ ' + (arqueo.diferencia || 0).toFixed(2)
                : '-S/ ' + Math.abs(arqueo.diferencia || 0).toFixed(2)}
            </td>
          </tr>
        </table>
      </div>` : '';

    return `
      <div class="reporte-wrap">
        <div class="reporte-header">
          <h2>🏎️ COCHERA POS</h2>
          <h3>Reporte de Turno — ${turno.tipo}</h3>
          <p><strong>Trabajador:</strong> ${turno.trabajador}</p>
          <p><strong>Inicio:</strong> ${inicio.toLocaleString('es-PE')}</p>
          ${fin
            ? `<p><strong>Fin:</strong> ${fin.toLocaleString('es-PE')}</p>`
            : '<p><strong>Estado:</strong> En curso</p>'}
        </div>
        ${cobros.length === 0
          ? '<p class="reporte-vacio">Sin cobros en este turno</p>'
          : `<table class="reporte-tabla">
              <thead><tr>
                <th>Placa</th><th>Cliente</th><th>Celular</th><th>Tipo</th>
                <th>Entrada</th><th>Salida</th><th>Monto</th>
              </tr></thead>
              <tbody>${filas}</tbody>
              <tfoot><tr>
                <td colspan="6"
                  style="text-align:right;font-weight:700;padding:12px">
                  TOTAL COBRADO:
                </td>
                <td style="font-weight:700;font-size:1.1rem;
                  color:#00d4aa;padding:12px">
                  S/ ${totalCobros.toFixed(2)}
                </td>
              </tr></tfoot>
            </table>`
        }
        ${htmlArqueo}
      </div>`;
  },

  // ── Descarga el reporte del turno como PDF usando html2pdf.js ──────────────
  descargarPDF(turno, cobros, arqueo) {
    if (typeof html2pdf === 'undefined') {
      mostrarToast('html2pdf no cargó correctamente', 'error');
      return;
    }
    const htmlReporte = this.generarHTMLReporte(cobros, turno, arqueo);

    // Contenedor temporal con estilos para que html2pdf lo renderice bien
    const wrapper = document.createElement('div');
    wrapper.style.cssText = `
      font-family: Arial, sans-serif;
      color: #1a2535;
      background: white;
      padding: 20px;
    `;
    wrapper.innerHTML = htmlReporte;
    document.body.appendChild(wrapper);

    const inicio = formatFecha(turno.inicio);
    const fechaStr = inicio.toLocaleDateString('es-PE', {
      day: '2-digit', month: '2-digit', year: 'numeric'
    }).replace(/\//g, '-');
    const nombreArchivo = `reporte-turno-${turno.trabajador || 'turno'}-${fechaStr}.pdf`;

    html2pdf()
      .set({
        margin:      [10, 10, 10, 10],
        filename:    nombreArchivo,
        html2canvas: { scale: 2, useCORS: true },
        jsPDF:       { unit: 'mm', format: 'a4', orientation: 'portrait' }
      })
      .from(wrapper)
      .save()
      .finally(() => document.body.removeChild(wrapper));
  }
};
