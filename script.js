// --- CONFIGURAÇÃO DA API ---
// --- CONFIGURAÇÃO DO SUPABASE ---
const SUPABASE_URL = "https://jylcmvoynmmyvlpnkkhj.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_q3f4KYC25_TyGmUhY2x5Lg_biiO4j8h";

const supabaseClient = typeof supabase !== 'undefined' ? supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

// --- FUNÇÃO PARA SALVAR NA NUVEM E LOCALMENTE ---
async function salvarDiaDaGestaoNoHist() {
    let historico = JSON.parse(localStorage.getItem("gondola_historico_checklists")) || [];

    let analiseGestao = {
        acao: "salvarDiaDaGestao",
        idSessao: Date.now(),
        setor: "Checklist Operacional",
        tipoMissao: "DIA_GESTAO",
        usuario: (typeof usuarioAtual !== "undefined" && usuarioAtual) ? usuarioAtual : "Administrador",
        data: new Date().toLocaleDateString("pt-BR"),
        hora: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        nota: 100,
        totalPerguntas: 1,
        conformes: 1,
        itensRespondidos: [{
            perguntaTexto: "Hoje é o dia da gestão, analise o comportamento da loja/missões, veja quais as pendencias.",
            setor: "Estratégico",
            resposta: "OK",
            observacao: "Auditoria analítica realizada pós-global"
        }]
    };

    historico.push(analiseGestao);
    localStorage.setItem("gondola_historico_checklists", JSON.stringify(historico));

    try {
        if (typeof URL_API !== 'undefined' && URL_API) {
            await fetch(URL_API, {
                method: "POST",
                mode: "no-cors",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(analiseGestao)
            });
            console.log("Dados sincronizados com sucesso!");
        }
    } catch (error) {
        console.error("Erro ao sincronizar com a nuvem:", error);
    }
}

// ==========================================
// 1. BANCOS DE DADOS SEPARADOS (Memória Local)
// ==========================================
let baseGlobalProdutos = JSON.parse(localStorage.getItem("gondola_base_global")) || []; 

let missoesPorSetor = JSON.parse(localStorage.getItem("gondola_missoes_setores")) || {
    "Mercearia Bebidas": [],
    "Mercearia Doce": [],
    "Mercearia Conservas": [],
    "Mercearia Alto Giro": [],
    "Mercearia Limpeza": [],
    "Frios Iogurte": [],
    "Frios Congelados": [],
    "Açougue": [],
    "Padaria": []
};

let produtosDoDia = [];        
let usuarioAtual = "";
let setorSelecionado = "";
let indiceAtual = 0;
let html5QrcodeScanner = null;

let checklistGerencialDoDia = JSON.parse(localStorage.getItem("gondola_checklist_dia")) || [];
let respostasChecklistAtual = JSON.parse(localStorage.getItem("gondola_respostas_checklist_atual")) || {};
let historicoChecklistsSalvos = JSON.parse(localStorage.getItem("gondola_historico_checklists")) || [];

let entregaEmEdicao = {
    cliente: "", cidade: "", bairro: "", rua: "", numero: "", apartamento: "Não", aptoDetalhe: "", caixas: 1, gelados: "Não", rota: "1"
};

async function salvarEtiquetaPendente(codigoBarras, descricaoProduto, lojaUser, setorUser) {
    if (!supabaseClient) return false;

    const novaEtiqueta = {
        "codigo de barras": String(codigoBarras).trim(),
        "descricao": String(descricaoProduto).trim(),
        "loja": lojaUser,
        "setor": setorUser,
        "status": "pendente",
        "data_criacao": new Date().toISOString()
    };

    const { data, error } = await supabaseClient
        .from('etiquetas_pendentes')
        .insert([novaEtiqueta])
        .select();

    if (error) {
        console.error("Erro ao salvar etiqueta:", error.message);
        return false;
    }
    return true;
}

async function salvarRegistroValidade(codigoBarras, descricaoProduto, dataValidade, quantidadeItem, lojaUser, setorUser) {
    if (!supabaseClient) return false;

    const registroValidade = {
        "codigo de barras": String(codigoBarras).trim(),
        "descricao": String(descricaoProduto).trim(),
        "validade": dataValidade,
        "quantidade": Number(quantidadeItem),
        "loja": lojaUser,
        "setor": setorUser,
        "usuario": usuarioAtual || "Operador",
        "data_registro": new Date().toISOString()
    };

    const { data, error } = await supabaseClient
        .from('validade')
        .insert([registroValidade])
        .select();

    if (error) return false;
    alert("Registro de validade enviado com sucesso!");
    return true;
}

// ==========================================
// 3. AUTENTICAÇÃO E LOGIN
// ==========================================
async function entrar() {
    let campoNome = document.getElementById("nome");
    let campoMatricula = document.getElementById("matricula");

    if (!campoNome || !campoMatricula) return;

    let nome = campoNome.value.trim();
    let matricula = campoMatricula.value.trim().toLowerCase();

    if (nome === "" || matricula === "") {
        alert("Preencha Nome e Matrícula.");
        return;
    }

    if (matricula === "admin" || nome.toLowerCase() === "admin") {
        usuarioAtual = "Administrador";
        if (typeof abrirPainelAdmin === "function") abrirPainelAdmin();
        return; 
    } 
    
    usuarioAtual = nome;
    localStorage.setItem("usuarioAtual", nome);
    localStorage.setItem("setorAtual", matricula); 

    await carregarDadosSetorSupabase(matricula);
    voltarMenuPrincipal();
}

async function carregarDadosSetorSupabase(setorDoColaborador) {
    if (!supabaseClient) return;
    try {
        let { data } = await supabaseClient
            .from('cadastro_global')
            .select('*')
            .eq('setor', setorDoColaborador);

        if (data && data.length > 0) {
            localStorage.setItem("etiquetas_pendentes", JSON.stringify(data));
        }
    } catch (err) {
        console.error("Erro no Supabase:", err);
    }
}

function mostrarTelaLoginInicial() {
    usuarioAtual = ""; 
    let container = document.querySelector(".container");
    if (!container) return;

    container.innerHTML = `
        <div class="topo">
            <h1>🛒 GÔNDOLA OK</h1>
            <p>Faça seu login para iniciar</p>
        </div>
        <div class="login">
            <label for="nome">Nome do Colaborador:</label>
            <input type="text" id="nome" placeholder="Digite seu nome completo">

            <label for="matricula">Matrícula / Setor:</label>
            <input type="password" id="matricula" placeholder="Digite sua matrícula ou setor">

            <button onclick="entrar()" style="background-color: #28a745; color: white;">Entrar no Sistema</button>
        </div>
    `;
}

function voltarMenuPrincipal() {
    let container = document.querySelector(".container");
    if (!container) return;

    container.innerHTML = `
        <div class="topo">
            <h1>🛒 GÔNDOLA OK</h1>
            <p>Operador: <strong>${usuarioAtual || "Não Identificado"}</strong></p>
        </div>

        <div class="login">
            <h2>Selecione seu Setor</h2>
            <button onclick="prepararMissaoSetor('Mercearia Bebidas')">🥤 Mercearia Bebidas</button>
            <button onclick="prepararMissaoSetor('Mercearia Doce')">🍬 Mercearia Doce</button><br><br>
            <button onclick="prepararMissaoSetor('Mercearia Conservas')">🥫 Mercearia Conservas</button><br><br>
            <button onclick="prepararMissaoSetor('Mercearia Alto Giro')">🔄 Mercearia Alto Giro</button><br><br>
            <button onclick="prepararMissaoSetor('Mercearia Limpeza')">🧴 Mercearia Limpeza</button><br><br>
            <button onclick="prepararMissaoSetor('Frios Iogurte')">🥛 Frios Iogurte</button><br><br>
            <button onclick="prepararMissaoSetor('Frios Congelados')">🧊 Frios Congelados</button><br><br>
            <button onclick="prepararMissaoSetor('Açougue')">🥩 Açougue</button><br><br>
            <button onclick="prepararMissaoSetor('Padaria')">🍞 Padaria</button>

            <hr style="margin:20px 0; border:0; border-top:1px solid #ccc;">

            <h2>Serviços de Apoio</h2>
            <button onclick="abrirAbaValidade()" style="background:#20c997; color:white;">📅 Verificar Validade</button>
            <button onclick="abrirAbaEtiquetas()" style="background:#ffc107; color:black; margin-top:10px;">🏷️ Etiquetas Pendentes</button>

            <hr style="margin:20px 0; border:0; border-top:1px solid #ccc;">

            <h2>🚚 Sistema de Entregas</h2>
            <button onclick="abrirAbaLancamentoEntrega()" style="background:#0275d8; color:white;">📦 Lançar Novas Entregas</button>
            <button onclick="mostrarTelaLoginInicial()" style="background:#6c757d; color:white; margin-top:20px;">⬅️ Sair do App</button>
        </div>
    `;
}
