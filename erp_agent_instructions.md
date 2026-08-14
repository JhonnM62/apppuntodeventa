# Guía de Implementación para Agentes Financieros (LangChain / LangGraph)

Para lograr que tus agentes de LangGraph o LangChain respondan con precisión milimétrica sobre la rentabilidad y el flujo de caja del negocio, necesitas estructurar sus **System Prompts**, sus **Herramientas (Tools)** y su **Lógica de Grafo** bajo los siguientes principios que descubrimos hoy.

## 1. System Prompt (Contexto del Agente)

Debes inyectar este contexto en el prompt base de tu agente financiero:

```text
Eres el CFO (Agente Financiero) de un restaurante. Tu objetivo es dar respuestas exactas sobre la rentabilidad y el flujo de caja usando la base de datos PostgreSQL del negocio.

REGLAS CRÍTICAS DE NEGOCIO:
1. Diferencia entre Platos y Bebidas: En la tabla ORDERVENTAS, NUNCA cuentes como "Platos vendidos" las categorías de 'LICORES', 'BEBIDAS', 'DESECHABLES', 'CERVEZAS' o 'ADICIONALES'. Los "platos" reales son 'PERROS', 'SANDWICH', 'SALCHIPAPAS', 'ALITAS', 'CARNES', y 'HAMBURGUESAS'.
2. Rentabilidad Teórica vs. Flujo de Caja: 
   - El "Costo de Receta" (RECETAINSUMOS) te dice cuánto cuesta hacer un plato, pero NO incluye mermas, gas, aceite, verduras ni empaques. 
   - Para calcular el "Flujo de Caja Real" o la plata libre, NUNCA uses la tabla de recetas. DEBES sumar los ingresos totales (VENTAS) y restarle el dinero que salió físicamente en compras (INVENTARIO / ORDERINVENTARIO) y gastos del día a día (GASTOS).
3. Gastos Fijos vs Variables: Los gastos como "Arriendo", "Luz" y "Agua" se pagan en un solo día, pero cubren todo el mes. Si calculas el flujo de caja en los primeros días del mes, el resultado será negativo. Debes explicarle esto al usuario y proyectar las ventas del resto del mes para dar la rentabilidad neta mensual.
```

## 2. Tools (Herramientas SQL para LangChain)

Tus nodos en LangGraph deben tener herramientas (Tools) que ejecuten consultas SQL específicas. Aquí están las 3 consultas de oro que tu agente debe usar:

### Tool 1: `get_real_cashflow(start_date, end_date)`
Esta herramienta calcula la plata que entró vs la que salió del bolsillo.

```sql
-- Ingresos Reales
SELECT SUM(o."Precio total"::numeric) as Ingresos 
FROM "ORDERVENTAS" o 
JOIN "VENTAS" v ON o."IDventas" = v."IDventas" 
WHERE v."FECHA" BETWEEN '{start_date}' AND '{end_date}';

-- Egresos por Compras de Insumos Extra (Gas, Aceite, Carnes)
SELECT SUM("Total"::numeric) as Gastos_Inventario 
FROM "INVENTARIO" 
WHERE DATE("Fecha y hora") BETWEEN '{start_date}' AND '{end_date}';

-- Egresos Operativos y Fijos (Verduras, Arriendo, Aseo)
SELECT SUM("Valor"::numeric) as Gastos_Generales 
FROM "GASTOS" 
WHERE "Fecha" BETWEEN '{start_date}' AND '{end_date}';
```
*El agente debe tomar los Ingresos y restar Gastos_Inventario + Gastos_Generales.*

### Tool 2: `get_plates_sold(start_date, end_date)`
Evita que el agente diga "Vendimos 40 platos" cuando 20 de ellos eran gaseosas y empaques.

```sql
SELECT 
    v."FECHA",
    SUM(CASE WHEN o."Categoria" IN ('PERROS', 'SANDWICH', 'SALCHIPAPAS', 'ALITAS', 'CARNES', 'HAMBURGUESAS') THEN o."Cantidad" ELSE 0 END) as Platos_Comida,
    SUM(CASE WHEN o."Categoria" NOT IN ('PERROS', 'SANDWICH', 'SALCHIPAPAS', 'ALITAS', 'CARNES', 'HAMBURGUESAS') THEN o."Cantidad" ELSE 0 END) as Bebidas_Desechables
FROM "ORDERVENTAS" o
JOIN "VENTAS" v ON o."IDventas" = v."IDventas"
WHERE v."FECHA" BETWEEN '{start_date}' AND '{end_date}'
GROUP BY v."FECHA"
ORDER BY v."FECHA";
```

### Tool 3: `project_end_of_month_cash()`
Si un usuario pregunta "¿Cuánto me va a quedar a fin de mes?", el agente debe calcular el promedio diario de los días operados y multiplicarlo por los días restantes.

```python
# Pseudo-código para el nodo de LangGraph
dias_operados = obtener_dias_con_ventas(mes_actual)
margen_operativo_acumulado = ingresos_totales - gastos_variables (inventario + verduras)
promedio_diario = margen_operativo_acumulado / dias_operados

dias_restantes = 31 - dias_operados
proyeccion_margen = promedio_diario * dias_restantes

ganancia_neta_estimada = margen_operativo_acumulado + proyeccion_margen - gastos_fijos_restantes
return ganancia_neta_estimada
```

## 3. Lógica del Grafo (LangGraph)

En tu arquitectura de LangGraph, debes tener un nodo supervisor que identifique el tipo de pregunta:
1. **Pregunta de Costeo (Ej. "¿Cuánto me gano en una hamburguesa?"):** Enruta al nodo que cruza `PRODUCTOS` con `RECETAINSUMOS` e `INSUMOS` (Costo teórico).
2. **Pregunta de Caja (Ej. "¿Por qué no hay plata?" o "¿Cuánto me quedó esta semana?"):** Enruta al nodo de Flujo de Caja que usa las consultas de `VENTAS`, `GASTOS` e `INVENTARIO` (Realidad de caja).

*Nota: Asegúrate de configurar la conexión de PostgreSQL en tu LangChain usando explícitamente `client_encoding='utf8'` para evitar errores al leer los nombres de los insumos con caracteres especiales.*
