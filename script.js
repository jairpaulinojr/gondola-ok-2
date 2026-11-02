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

// ==========================================
// LANÇAMENTO DE ENTREGAS (FISCAL DE CAIXA)
// ==========================================
async function abrirAbaLancamentoEntrega() {
    let container = document.querySelector(".container");
    if (!container) return;

    entregaEmEdicao = { cliente: "", cidade: "", bairro: "", rua: "", numero: "", apartamento: "Não", aptoDetalhe: "", caixas: 1, gelados: "Não", rota: "1" };

    container.innerHTML = `
        <div class="topo" style="background:#0275d8;">
            <h1>📦 LANÇAMENTO DE ENTREGAS</h1>
            <p>Fluxo Direto Conectado ao Supabase</p>
        </div>

        <div style="padding: 20px; text-align: left;">
            <div id="bloco_passo1" style="margin-bottom: 15px;">
                <label style="font-weight:bold; font-size:14px; color:#333;">Nome do Cliente:</label>
                <input type="text" id="ent_nome_cliente" placeholder="Digite o nome do cliente..." oninput="buscarClienteCadastro(this.value)"
                style="width:100%; padding:14px; border:1px solid #ccc; border-radius:6px; box-sizing:border-box; font-size:16px; margin-top:5px; text-transform: uppercase;">
                <div id="sugestoes_clientes" style="background:white; border-radius:0 0 6px 6px; max-height:150px; overflow-y:auto;"></div>
            </div>

            <div id="painel_cascata_botoes"></div>

            <div id="formulario_final_entrega" style="display:none; background:#f8f9fa; padding:15px; border-radius:8px; border:1px solid #ddd; margin-top:15px;">
                <div style="margin-bottom: 12px;">
                    <label style="font-weight:bold; font-size:13px;">Número da Residência:</label>
                    <input type="text" id="ent_numero" placeholder="Ex: 150 ou S/N" style="width:100%; padding:10px; border:1px solid #ccc; border-radius:4px; font-size:15px; margin-top:5px;">
                </div>

                <div style="margin-bottom: 12px;">
                    <label style="font-weight:bold; font-size:13px;">É Apartamento / Bloco?</label>
                    <select id="ent_apto" onchange="toggleCampoApartamento(this.value)" style="width:100%; padding:10px; border:1px solid #ccc; border-radius:4px; font-size:15px; margin-top:5px;">
                        <option value="Não">Não</option>
                        <option value="Sim">Sim</option>
                    </select>
                </div>

                <div id="bloco_detalhe_apto" style="display:none; margin-bottom: 12px;">
                    <label style="font-weight:bold; font-size:13px; color:#d9534f;">Detalhes do Apartamento:</label>
                    <input type="text" id="ent_apto_detalhe" placeholder="Ex: Apto 302, Bloco B" style="width:100%; padding:10px; border:1px solid #ccc; border-radius:4px; font-size:15px; margin-top:5px;">
                </div>

                <div style="margin-bottom: 12px;">
                    <label style="font-weight:bold; font-size:13px;">Quantidade de Caixas / Volumes:</label>
                    <input type="number" id="ent_caixas" value="1" min="1" style="width:100%; padding:10px; border:1px solid #ccc; border-radius:4px; font-size:15px; margin-top:5px;">
                </div>

                <div style="margin-bottom: 15px;">
                    <label style="font-weight:bold; font-size:13px; color:#0275d8;">❄️ Contém Itens Gelados / Congelados?</label>
                    <select id="ent_gelados" style="width:100%; padding:10px; border:1px solid #0275d8; border-radius:4px; font-size:15px; margin-top:5px; font-weight:bold; color:#0275d8;">
                        <option value="Não">Não</option>
                        <option value="Sim">❄️ SIM (Prioridade Máxima)</option>
                    </select>
                </div>

                <button onclick="salvarNovaEntrega()" style="width:100%; padding:16px; background:#28a745; color:white; border:none; border-radius:6px; font-weight:bold; font-size:16px; cursor:pointer;">
                    💾 SALVAR E GERAR TICKET
                </button>
            </div>

            <button onclick="voltarMenuPrincipal()" style="width:100%; padding:12px; background:#6c757d; color:white; border:none; border-radius:6px; margin-top:20px; cursor:pointer; font-weight:bold;">
                ↩ Voltar ao Menu
            </button>
        </div>
    `;

    renderizarBotoesCidade();
}

async function buscarClienteCadastro(nomeDigitado) {
    let termo = nomeDigitado.trim().toUpperCase();
    let divSugestoes = document.getElementById("sugestoes_clientes");
    if (!divSugestoes) return;

    if (termo.length < 2) {
        divSugestoes.innerHTML = "";
        return;
    }

    if (!supabaseClient) return;

    let { data } = await supabaseClient
        .from('entregas')
        .select('*')
        .ilike('cliente', `%${termo}%`)
        .limit(5);

    if (!data || data.length === 0) {
        divSugestoes.innerHTML = `<div style="padding:10px; color:#888; font-size:13px;">🆕 Cliente novo. Prossiga abaixo.</div>`;
        entregaEmEdicao.cliente = termo;
        return;
    }

    renderizarSugestoesClientes(data);
}

function renderizarSugestoesClientes(resultados) {
    let divSugestoes = document.getElementById("sugestoes_clientes");
    if (!divSugestoes) return;

    divSugestoes.innerHTML = resultados.map(c => {
        let cliente = c.cliente || '';
        let cidade = c.cidade || '';
        let bairro = c.bairro || '';
        let rua = c.rua || '';
        let numero = c.numero || '';
        let apto = c.apartamento || 'Não';
        let aptoDet = c.apartamentoDetalhe || '';

        return `
            <div onclick="aplicarClienteCadastrado('${cliente}', '${cidade}', '${bairro}', '${rua}', '${numero}', '${apto}', '${aptoDet}')" 
                 style="padding:12px; border-bottom:1px solid #eee; cursor:pointer; background:#fffbf0; font-weight:bold; color:#333;">
                 👤 ${cliente} <br>
                 <span style="font-size:11px; color:#777;">📍 ${rua}, Nº ${numero} - ${bairro} (${cidade})</span>
            </div>
        `;
    }).join("");
}

function aplicarClienteCadastrado(nome, cidade, bairro, rua, numero, apto, aptoDet) {
    document.getElementById("ent_nome_cliente").value = nome;
    document.getElementById("sugestoes_clientes").innerHTML = "";

    entregaEmEdicao = {
        cliente: nome, cidade: cidade, bairro: bairro, rua: rua,
        numero: numero, apartamento: apto, aptoDetalhe: aptoDet,
        caixas: 1, gelados: "Não"
    };

    let painel = document.getElementById("painel_cascata_botoes");
    painel.innerHTML = `
        <div style="background:#d1ecf1; color:#0c5460; padding:12px; border-radius:6px; margin-bottom:10px; border-left:5px solid #17a2b8;">
            <strong>📍 Endereço Recorrente:</strong><br>
            ${rua}, ${numero}${apto === 'Sim' ? '- ' + aptoDet : ''}<br>
            ${bairro} (${cidade})
            <button onclick="renderizarBotoesCidade()" style="margin-top:8px; display:block; padding:4px 8px; background:#17a2b8; color:white; border:none; border-radius:4px; font-size:11px; cursor:pointer;">🔄 Alterar Endereço</button>
        </div>
    `;

    document.getElementById("formulario_final_entrega").style.display = "block";
    document.getElementById("ent_numero").value = numero;
    document.getElementById("ent_apto").value = apto;
    toggleCampoApartamento(apto);
    document.getElementById("ent_apto_detalhe").value = aptoDet;
}

function toggleCampoApartamento(valor) {
    let bloco = document.getElementById("bloco_detalhe_apto");
    if (bloco) bloco.style.display = (valor === "Sim") ? "block" : "none";
}

async function renderizarBotoesCidade() {
    let cidades = ["MANHUMIRIM", "ALTO JEQUITIBÁ", "MANHUAÇU"];

    if (supabaseClient) {
        let { data } = await supabaseClient.from('enderecos').select('cidade');
        if (data && data.length > 0) {
            cidades = [...new Set(data.map(r => r.cidade))].sort();
        }
    }

    let painel = document.getElementById("painel_cascata_botoes");
    if (!painel) return;

    document.getElementById("formulario_final_entrega").style.display = "none";

    painel.innerHTML = `
        <label style="font-weight:bold; font-size:13px; color:#555; display:block; margin-bottom:5px;">1. Selecione a Cidade:</label>
        <div style="display:flex; gap:8px; flex-wrap:wrap;">
            ${cidades.map(cid => `<button onclick="selecionarCidade('${cid}')" style="padding:12px; background:#fff; border:2px solid #0275d8; color:#0275d8; border-radius:6px; font-weight:bold; cursor:pointer;">🏙️ ${cid}</button>`).join("")}
        </div>
    `;
}

async function selecionarCidade(nomeCidade) {
    entregaEmEdicao.cidade = nomeCidade;
    let bairros = [];

    if (supabaseClient) {
        let { data } = await supabaseClient
            .from('enderecos')
            .select('bairro')
            .eq('cidade', nomeCidade);
        if (data) bairros = [...new Set(data.map(r => r.bairro))].sort();
    }

    let painel = document.getElementById("painel_cascata_botoes");
    if (!painel) return;

    painel.innerHTML = `
        <div style="color:#28a745; font-size:13px; margin-bottom:8px;">✅ Cidade: <b>${nomeCidade}</b></div>
        <label style="font-weight:bold; font-size:13px; color:#555; display:block; margin-bottom:5px;">2. Selecione o Bairro:</label>
        <div style="display:flex; gap:8px; flex-wrap:wrap;">
            ${bairros.map(b => `<button onclick="selecionarBairro('${b}')" style="padding:10px; background:#fff; border:1px solid #28a745; color:#28a745; border-radius:4px; font-size:13px; cursor:pointer;">📍 ${b}</button>`).join("")}
        </div>
    `;
}

async function selecionarBairro(nomeBairro) {
    entregaEmEdicao.bairro = nomeBairro;
    document.getElementById("formulario_final_entrega").style.display = "block";
}

async function salvarNovaEntrega() {
    let num = document.getElementById("ent_numero").value.trim();
    let apto = document.getElementById("ent_apto").value;
    let aptoDet = document.getElementById("ent_apto_detalhe").value.trim();
    let caixas = document.getElementById("ent_caixas").value;
    let gelados = document.getElementById("ent_gelados").value;

    if (!entregaEmEdicao.cliente) {
        let campo = document.getElementById("ent_nome_cliente");
        if (campo && campo.value) entregaEmEdicao.cliente = campo.value.trim().toUpperCase();
    }

    if (!entregaEmEdicao.cliente || !num) {
        alert("Preencha o nome do cliente e o número da residência!");
        return;
    }

    entregaEmEdicao.numero = num;
    entregaEmEdicao.apartamento = apto;
    entregaEmEdicao.apartamentoDetalhe = aptoDet;
    entregaEmEdicao.caixas = Number(caixas);
    entregaEmEdicao.gelados = gelados;
    entregaEmEdicao.status = "pendente";
    entregaEmEdicao.data_criacao = new Date().toISOString();

    if (supabaseClient) {
        let { error } = await supabaseClient.from('entregas').insert([entregaEmEdicao]);
        if (error) {
            alert("Erro ao salvar entrega no Supabase.");
            return;
        }
    }

    alert("✅ Entrega salva com sucesso!");
    voltarMenuPrincipal();
}

async function autenticarNoSupabase(nomeDigitado, matriculaDigitada) {
    if (!supabaseClient) return false;

    let { data, error } = await supabaseClient
        .from('usuarios')
        .select('*')
        .eq('matricula', matriculaDigitada)
        .single();

    if (error || !data) {
        alert("Matrícula não encontrada ou acesso negado.");
        return false;
    }

    usuarioAtual = data.nome;
    setorSelecionado = data.setor;
    localStorage.setItem("usuarioAtual", data.nome);
    localStorage.setItem("setorAtual", data.setor);
    localStorage.setItem("lojaAtual", data.loja || "Geral");

    return true;
}
