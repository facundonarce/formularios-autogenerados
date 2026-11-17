import { useMemo, useState } from 'react';
import { Store, Users } from 'lucide-react';
import { useDatos } from '../lib/datos.jsx';
import { Card, CardTitle, Tabla, Toolbar, Selector, Toggle, Badge, Guion, Copiar } from '../components/ui.jsx';
import { puntajesMaximos } from '../../shared/logic.js';
import { MODULOS } from '../../shared/catalog.js';

export default function Tiendas() {
  const { data, d } = useDatos();
  const [pais, setPais] = useState('Todos');
  const [tipo, setTipo] = useState('todas');
  const filas = useMemo(() => data.tiendas.filter((t) => (pais === 'Todos' || t.pais === pais) && (tipo === 'todas' || t.tipo === tipo)), [data, pais, tipo]);
  const maxO = puntajesMaximos(data.preguntas, 'oficial');
  const maxR = puntajesMaximos(data.preguntas, 'reseller');

  return (
    <div className="grid lg:grid-cols-3 gap-4 items-start">
      <Card className="lg:col-span-2">
        <CardTitle icon={Store}>Tiendas ({filas.length})</CardTitle>
        <Toolbar>
          <Selector etiqueta="País" value={pais} onChange={setPais} opciones={['Todos', ...d.paises]} />
          <Toggle value={tipo} onChange={setTipo} opciones={[{ value: 'todas', label: 'Todas' }, { value: 'oficial', label: 'Oficiales' }, { value: 'reseller', label: 'Resellers' }]} />
        </Toolbar>
        <Tabla columnas={[
          { key: 'nombre', titulo: 'Tienda', ancho: 180 },
          { key: 'tipo', titulo: 'Tipo', render: (t) => <Badge tono={t.tipo === 'reseller' ? 'medio' : 'marca'}>{t.tipo === 'reseller' ? 'Reseller' : 'Oficial'}</Badge> },
          { key: 'pais', titulo: 'País' },
          { key: 'timezone', titulo: 'Zona horaria', render: (t) => <span className="text-[11px]">{t.timezone.replace('America/', '').replace(/_/g, ' ')}</span> },
          { key: 'link_tablet', titulo: 'Link de la tablet', render: (t) => t.link_tablet ? <Copiar texto={t.link_tablet} etiqueta="Copiar link" /> : <Badge tono="mal">Sin clave</Badge> },
          { key: 'franjas', titulo: 'Franjas', render: (t) => t.franjas || <span className="text-muted">General</span> },
        ]} filas={filas} maxAlto="calc(100vh - 280px)" />
        <p className="text-[11px] text-muted mt-2">Se editan en la pestaña Tiendas del Google Sheet. El link de la tablet se abre una vez en la tablet de cada tienda y se deja fijo: ahí aparece cada formulario nuevo. El aviso por Slack queda para la etapa 2.</p>
      </Card>
      <div className="space-y-4">
        <Card>
          <CardTitle>Puntaje máximo por módulo</CardTitle>
          <Tabla densa columnas={[
            { key: 'm', titulo: 'Módulo' },
            { key: 'o', titulo: 'Oficial', num: true, render: (r) => r.o.toFixed(1).replace('.', ',') },
            { key: 'r', titulo: 'Reseller', num: true, render: (r) => r.r.toFixed(1).replace('.', ',') },
          ]} filas={MODULOS.map((m) => ({ id: m, m, o: maxO[m], r: maxR[m] }))} />
          <p className="text-[10px] text-muted mt-2">Suma de pesos de las preguntas medibles por formulario (sin las que quedan en cámaras). Cada mes el denominador es la suma de las preguntas que efectivamente se evaluaron.</p>
        </Card>
        <Card>
          <CardTitle icon={Users}>Usuarios del panel</CardTitle>
          <Tabla densa columnas={[
            { key: 'email', titulo: 'Email' },
            { key: 'rol', titulo: 'Rol', render: (u) => <Badge tono={u.rol === 'admin' ? 'marca' : 'neutro'}>{u.rol === 'admin' ? 'Administrador' : 'Responsable'}</Badge> },
          ]} filas={data.usuarios.map((u) => ({ ...u, id: u.email }))} vacio={<Guion />} />
        </Card>
      </div>
    </div>
  );
}
