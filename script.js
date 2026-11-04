// ==========================================
// 1. ARRANQUE SEGURO DA APLICAÇÃO
// ==========================================
window.addEventListener('DOMContentLoaded', () => {
if (typeof mostrarTelaLoginInicial === "function") {
mostrarTelaLoginInicial();
}
});

// ==========================================
// 2. CONFIGURAÇÃO E CONEXÃO COM O SUPABASE
// ==========================================
const SUPABASE_URL = "https://jylcmvoynmmyvlpnkkhj.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_q3f4KYC25_TyGmUhY2x5Lg_biiO4j8h";

// Cliente seguro do Supabase
const supabaseClient = (typeof supabase !== 'undefined' && supabase.createClient)
? supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
: null;

// ==========================================
// 3. VARIÁVEIS GLOBAIS DE SESSÃO
// ==========================================
let usuarioAtual = "";
let setorSelecionado = "";
// ==========================================
// 4. CONSULTAS À BASE GLOBAL (CADASTRAR E BUSCAR)
// ==========================================

// Função auxiliar para buscar produto pelo código de barras no Supabase
async function buscarProdutoSupabase(codigoBarras) {
let codigoLimpo = codigoBarras ? String(codigoBarras).trim() : "";
if (!codigoLimpo || !supabaseClient) return null;

try {
let { data, error } = await supabaseClient
.from('cadastro_global')
.select('*')
.eq('CODIGO DE BARRAS', codigoLimpo)
.single();

if (error || !data) return null;

return {
codigo: data['CODIGO DE BARRAS'],
descricao: data['PRODUTO'] || "Produto sem descrição"
};
} catch (e) {
console.error("Erro ao buscar no cadastro_global:", e);
return null;
}
}

// ==========================================
// 5. MÓDULO DE VERIFICAÇÃO DE VALIDADE
// ==========================================

// Tela de leitura e formulário de validade
function abrirAbaValidade() {
let container = document.querySelector(".container");
if (!container) return;

container.innerHTML = `
<div class="topo">
<h1>📅 VERIFICAÇÃO DE VALIDADE</h1>
</div>
<div class="login" style="max-width:100%;">
<label>Código de Barras:</label>
<input type="text" id="input-manual-code" placeholder="Bipe ou digite o código...">
<button onclick="processarBuscaValidade()" style="padding:10px; margin-top:5px; background:#28a745; color:white; width:100%; border:none; border-radius:5px; font-weight:bold; cursor:pointer;">🔍 VERIFICAR PRODUTO</button>

<div id="resultado-validade" style="margin-top: 20px; display:none; text-align:left; background:#f9f9f9; padding:15px; border-radius:5px; border: 1px solid #ddd;"></div>
<br>
<button onclick="voltarMenuPrincipal()" style="background:#6c757d; color:white; width:100%; padding:10px; border:none; border-radius:5px; font-weight:bold; cursor:pointer;">⬅️ Voltar ao Menu</button>
</div>
`;
setTimeout(() => document.getElementById("input-manual-code")?.focus(), 100);
}

// Processa a busca na tabela cadastro_global para a validade
async function processarBuscaValidade() {
let codigo = document.getElementById("input-manual-code").value;
let display = document.getElementById("resultado-validade");
if (!display) return;

display.style.display = "block";
display.innerHTML = <p style="text-align:center; color:#6c757d;"&gt;🔍 Consultando cadastro global...&lt;/p>;

let produto = await buscarProdutoSupabase(codigo);

if (!produto) {
display.innerHTML = <p style="color:red; text-align:center;"&gt;❌ Produto não encontrado na tabela 'cadastro_global'.&lt;/p>;
return;
}

display.innerHTML = &lt;p&gt;&lt;strong&gt;Produto:&lt;/strong&gt; ${produto.descricao}</p>
<p><strong>Código:</strong> `${produto.codigo}</p>
<label><strong>Data de Vencimento:</strong></label>
<input type="date" id="data-venc" style="width:100%; padding:8px; margin: 10px 0;">
<label><strong>Quantidade:</strong></label>


// ==========================================
// 7. MÓDULO DE LANÇAMENTOS E LEITURAS DE ENTREGAS
// ==========================================

// Tela inicial de Monitoramento / Lançamento de Entregas
function abrirMonitoramentoEntregas() {
let container = document.querySelector(".container");
if (!container) return;

container.innerHTML = `
<div class="topo" style="background:#17a2b8;">
<h1>🚚 MONITORAMENTO DE ENTREGAS</h1>
</div>
<div style="padding:20px; text-align:left;">
<div style="background:#f8f9fa; padding:15px; border-radius:6px; margin-bottom:15px; border:1px solid #ddd;">
<h3 style="margin-top:0; color:#333;">Novo Lançamento de Entrega</h3>
<label style="font-weight:bold; font-size:13px;">Nota Fiscal / Pedido:</label>
<input id="input_nf_entrega" placeholder="Número do documento..." style="width:100%; padding:10px; margin:5px 0 10px; box-sizing:border-box;">

<label style="font-weight:bold; font-size:13px;">Motorista / Responsável:</label>
<input id="input_motorista_entrega" placeholder="Nome do motorista..." style="width:100%; padding:10px; margin:5px 0 10px; box-sizing:border-box;">

<label style="font-weight:bold; font-size:13px;">Observação / Setor:</label>
<input id="input_obs_entrega" placeholder="Ex: Carga frágil, rotas..." style="width:100%; padding:10px; margin:5px 0 15px; box-sizing:border-box;">

<button onclick="salvarNovaEntregaSupabase()" style="width:100%; padding:12px; background:#28a745; color:white; border:0; border-radius:5px; font-weight:bold; cursor:pointer;">
💾 Salvar e Lançar Entrega
</button>
</div>

<hr style="margin:20px 0; border:0; border-top:1px solid #ddd;">

<h3 style="color:#333;">Entregas Registradas na Nuvem</h3>
<div id="lista_entregas_container" style="margin-top:10px;">
<p style="color:#6c757d; text-align:center;">⏳ Carregando entregas do Supabase...</p>
</div>

<button onclick="voltarMenuPrincipal()" style="width:100%; padding:12px; background:#6c757d; color:white; border:0; border-radius:6px; margin-top:20px; cursor:pointer; font-weight:bold;">
↩ Voltar ao Menu
</button>
</div>
`;

// Carrega a listagem do Supabase logo após abrir a tela
carregarListaEntregasSupabase();
}

// Salva uma nova entrega na tabela 'entregas' do Supabase
async function salvarNovaEntregaSupabase() {
let nf = document.getElementById("input_nf_entrega").value.trim();
let motorista = document.getElementById("input_motorista_entrega").value.trim();
let obs = document.getElementById("input_obs_entrega").value.trim();

if (!nf || !motorista) {
alert("⚠️ Preencha pelo menos o número da Nota Fiscal e o nome do motorista!");
return;
}

if (!supabaseClient) {
alert("❌ Erro de conexão com o Supabase.");
return;
}

let dadosEntrega = {
nota_fiscal: nf,
motorista: motorista,
observacao: obs,
status: "Pendente",
data: new Date().toLocaleDateString("pt-BR")
};

let { error } = await supabaseClient.from('entregas').insert([dadosEntrega]);

if (error) {
console.error("Erro ao salvar entrega:", error);
alert("❌ Erro ao salvar entrega no Supabase. Verifique os nomes das colunas da tabela.");
return;
}

alert("✅ Entrega lançada com sucesso!");
abrirMonitoramentoEntregas();
}

// Carrega a listagem de entregas cadastradas no Supabase para o motorista/gestor visualizarem
async function carregarListaEntregasSupabase() {
let containerLista = document.getElementById("lista_entregas_container");
if (!containerLista || !supabaseClient) return;

let { data, error } = await supabaseClient.from('entregas').select('*');

if (error || !data) {
containerLista.innerHTML = <p style="color:red; text-align:center;"&gt;❌ Erro ao carregar entregas da nuvem.&lt;/p>;
return;
}

if (data.length === 0) {
containerLista.innerHTML = <p style="color:#6c757d; text-align:center;"&gt;Nenhuma entrega registrada no momento.&lt;/p>;
return;
}

let htmlTabela = &lt;table style="width:100%; border-collapse:collapse; background:white; font-size:13px;"&gt; &lt;tr style="background:#f2f2f2; text-align:left;"&gt; &lt;th style="padding:8px;"&gt;NF / Pedido&lt;/th&gt; &lt;th style="padding:8px;"&gt;Motorista&lt;/th&gt; &lt;th style="padding:8px; text-align:center;"&gt;Status&lt;/th&gt; &lt;th style="padding:8px; text-align:center;"&gt;Ação&lt;/th&gt; &lt;/tr&gt;;

data.forEach((item) => {
let nf = item.nota_fiscal || item.nf || item.pedido || "N/D";
let motorista = item.motorista || "N/D";
let status = item.status || "Pendente";
let idItem = item.id; // Chave primária padrão do Supabase se houver

htmlTabela += &lt;tr style="border-bottom:1px solid #ddd;"&gt; &lt;td style="padding:8px;"&gt;&lt;strong&gt;${nf}</strong><br><small>${item.data || ''}&lt;/small&gt;&lt;/td&gt; &lt;td style="padding:8px;"&gt;${motorista}</td>
<td style="padding:8px; text-align:center; color:${status === 'Concluído' ? 'green' : 'orange'}; font-weight:bold;"&gt;${status}</td>
<td style="padding:8px; text-align:center;">
<button onclick="concluirEntregaSupabase('${nf}')" style="background:#28a745; color:white; border:none; padding:5px 8px; border-radius:4px; cursor:pointer; font-weight:bold;"&gt;✓ Baixa&lt;/button&gt; &lt;/td&gt; &lt;/tr&gt;;
});

htmlTabela += </table>;
containerLista.innerHTML = htmlTabela;
}

// Atualiza o status da entrega para concluída na nuvem
async function concluirEntregaSupabase(nf) {
if (!confirm(Deseja dar baixa na entrega da NF: ${nf}?)) return;

if (supabaseClient) {
// Tenta atualizar pelo campo nota_fiscal
let { error } = await supabaseClient
.from('entregas')
.update({ status: 'Concluído' })
.eq('nota_fiscal', nf);

if (error) {
alert("Erro ao atualizar status no Supabase.");
return;
}
}

alert("✅ Entrega concluída com sucesso!");
carregarListaEntregasSupabase();
}

// ==========================================
// BUSCA MULTIFACETADA NA TABELA GLOBAL (LOJA, SETOR E PRODUTO)
// ==========================================

async function buscarNaTabelaGlobalAvancada(filtroLoja, filtroSetor, termoProduto) {
if (!supabaseClient) return [];

try {
// Começa a consulta na tabela 'missoes_tabela_global'
let query = supabaseClient.from('missoes_tabela_global').select('*');

// Se o usuário informou a loja, filtra por ela
if (filtroLoja && filtroLoja.trim() !== "") {
query = query.ilike('loja', %${filtroLoja.trim()}%`);
}

// Se o usuário informou o setor, filtra por ele
if (filtroSetor && filtroSetor.trim() !== "") {
query = query.ilike('setor', %${filtroSetor.trim()}%`);
}

// Se o usuário digitou parte do nome do produto, filtra pela descrição
if (termoProduto && termoProduto.trim() !== "") {
query = query.ilike('descricao', %${termoProduto.trim()}%);
}

let { data, error } = await query.limit(50);

if (error) {
console.error("Erro na busca avançada da base global:", error);
return [];
}

return data || [];
} catch (e) {
console.error("Erro de conexão com o Supabase:", e);
return [];
}
}

// ==========================================
// MÓDULO DE CONSULTA / AUDITORIA DE MISSÕES
// ==========================================

function abrirBuscaMissoesGlobal() {
let container = document.querySelector(".container");
if (!container) return;

container.innerHTML = `
<div class="topo" style="background:#007bff;">
<h1>🔍 BUSCA DE MISSÕES / AUDITORIA</h1>
<p>Consulta na Base Global</p>
</div>
<div style="padding:15px; text-align:left;">
<div style="background:#f8f9fa; padding:15px; border-radius:6px; border:1px solid #ddd; margin-bottom:15px;">
<label style="font-weight:bold; font-size:13px;">Loja:</label>
<input id="filtro_loja" placeholder="Ex: MIRANDA MANHUMIRIM..." style="width:100%; padding:10px; margin:5px 0 10px; box-sizing:border-box;">

<label style="font-weight:bold; font-size:13px;">Setor:</label>
<input id="filtro_setor" placeholder="Ex: seca basica, bebidas, acougue..." style="width:100%; padding:10px; margin:5px 0 10px; box-sizing:border-box;">

<label style="font-weight:bold; font-size:13px;">Produto / Descrição:</label>
<input id="filtro_produto" placeholder="Digite o nome do produto..." style="width:100%; padding:10px; margin:5px 0 15px; box-sizing:border-box;">

<button onclick="executarPesquisaMissoes()" style="width:100%; padding:12px; background:#007bff; color:white; border:0; border-radius:5px; font-weight:bold; cursor:pointer;">
🔍 PESQUISAR PRODUTOS
</button>
</div>

<div id="resultado_busca_missoes">
<p style="color:#6c757d; text-align:center;">Preencha os campos acima para realizar a busca.</p>
</div>

<button onclick="voltarMenuPrincipal()" style="width:100%; padding:12px; background:#6c757d; color:white; border:0; border-radius:6px; margin-top:20px; cursor:pointer; font-weight:bold;">
↩ Voltar ao Menu
</button>
</div>
`;
}

async function executarPesquisaMissoes() {
let loja = document.getElementById("filtro_loja").value;
let setor = document.getElementById("filtro_setor").value;
let produto = document.getElementById("filtro_produto").value;
let containerResultado = document.getElementById("resultado_busca_missoes");

if (!containerResultado) return;
containerResultado.innerHTML = <p style="text-align:center; color:#6c757d;"&gt;⏳ Buscando no Supabase...&lt;/p>;

let resultados = await buscarNaTabelaGlobalAvancada(loja, setor, produto);

if (resultados.length === 0) {
containerResultado.innerHTML = <p style="color:red; text-align:center; font-weight:bold;"&gt;❌ Nenhum produto localizado com estes filtros.&lt;/p>;
return;
}

let html = &lt;p style="color:green; font-weight:bold; margin-bottom:10px;"&gt;Encontrado(s) ${resultados.length} item(ns):</p>
<table style="width:100%; border-collapse:collapse; background:white; font-size:12px;">
<tr style="background:#e9ecef; text-align:left;">
<th style="padding:8px;">Produto</th>
<th style="padding:8px;">Setor</th>
<th style="padding:8px;">Loja</th>
</tr>
`;

resultados.forEach(item => {
let desc = item.descricao || "Sem Descrição";
let cod = item["codigo de barras"] || item.codigo || "";
let set = item.setor || "-";
let loj = item.loja || "-";

html += &lt;tr style="border-bottom:1px solid #ddd;"&gt; &lt;td style="padding:8px;"&gt;&lt;strong&gt;${desc}</strong><br><small style="color:#555;">Cód:  {set}</td>
<td style="padding:8px;">${loj}</td>
</tr>
`;
});

html += </table>;
containerResultado.innerHTML = html;
}
