// --- CONFIGURAÇÃO DA API ---
const URL_API = "https://script.google.com/macros/s/AKfycbykcWGN0f38oAR5wwgkuVLaCaBv0baDK4uCODUg3Cf9Fpa3i3-VQAnzdiGpVdfnan99/exec";

// --- FUNÇÃO PARA SALVAR NA NUVEM E LOCALMENTE ---
async function salvarDiaDaGestaoNoHist() {
    let historico = JSON.parse(localStorage.getItem("gondola_historico_checklists")) || [];

    let analiseGestao = {
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

    // 1. Salva no armazenamento local do navegador
    historico.push(analiseGestao);
    localStorage.setItem("gondola_historico_checklists", JSON.stringify(historico));

    // 2. Envia para o Google Sheets via API
    try {
        await fetch(URL_API, {
            method: "POST",
            mode: "no-cors",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(analiseGestao)
        });
        console.log("Dados sincronizados com sucesso!");
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
// --- ADICIONE APENAS ESTAS LINHAS ABAIXO PARA O CHECKLIST ---
let checklistGerencialDoDia = JSON.parse(localStorage.getItem("gondola_checklist_dia")) || [];
let respostasChecklistAtual = JSON.parse(localStorage.getItem("gondola_respostas_checklist_atual")) || {};
let historicoChecklistsSalvos = JSON.parse(localStorage.getItem("gondola_historico_checklists")) || [];

// ==========================================
// 1.5. FUNÇÃO DE EXPORTAÇÃO (UTILS)
// ==========================================
function exportarParaExcel(nomeArquivo, chaveLocalStorage) {
    let dados = JSON.parse(localStorage.getItem(chaveLocalStorage)) || [];
    if (dados.length === 0) {
        alert("Nenhum dado disponível para exportação!");
        return;
    }

    let ws = XLSX.utils.json_to_sheet(dados);
    let wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Dados");
    XLSX.writeFile(wb, nomeArquivo + ".xlsx");
}

// ==========================================
// 2. PROCESSADOR DE CARGA DE EXCEL POR SETOR
// ==========================================
function carregarPlanilhaSetor(inputElement, nomeSetor) {
    let arquivo = inputElement.files[0];
    if (!arquivo) return;

    let leitor = new FileReader();
    leitor.onload = function(evento) {
        let dados = new Uint8Array(evento.target.result);
        let arquivoExcel = XLSX.read(dados, {type: 'array'});
        let json = XLSX.utils.sheet_to_json(arquivoExcel.Sheets[arquivoExcel.SheetNames[0]]);
        
        missoesPorSetor[nomeSetor] = json.map((item, idx) => {
            let codigoEncontrado = item["Cód. de Barras"] || item["codigo"] || item["Código"] || item["Codigo"] || "";
            let descricaoEncontrada = item["DESCRIÇÃO"] || item["descricao"] || item["Descrição"] || item["Descricao"] || "";

            return {
                id: Date.now() + idx + Math.random(), 
                codigo: String(codigoEncontrado).trim(),
                descricao: String(descricaoEncontrada).trim(),
                setor: nomeSetor,
                abastecido: null,
                precificado: null,
                statusRuptura: false,
                finalizacaoGerente: null
            };
        }).filter(p => p.codigo !== "" && p.descricao !== "");

        localStorage.setItem("gondola_missoes_setores", JSON.stringify(missoesPorSetor));
        alert(`Sucesso: ${missoesPorSetor[nomeSetor].length} itens carregados para a Missão de [${nomeSetor}]!`);
        abrirPainelAdmin(); 
    };
    leitor.readAsArrayBuffer(arquivo);
}

function carregarBaseGlobal(inputElement) {
    let arquivo = inputElement.files[0];
    if (!arquivo) return;

    let leitor = new FileReader();
    leitor.onload = function(evento) {
        let dados = new Uint8Array(evento.target.result);
        let arquivoExcel = XLSX.read(dados, {type: 'array'});
        let json = XLSX.utils.sheet_to_json(arquivoExcel.Sheets[arquivoExcel.SheetNames[0]]);
        
        baseGlobalProdutos = json.map(item => {
            let codigoEncontrado = item["Cód. de Barras"] || item["codigo"] || item["Código"] || item["Codigo"] || "";
            let descricaoEncontrada = item["DESCRIÇÃO"] || item["descricao"] || item["Descrição"] || item["Descricao"] || "";
            
            return {
                codigo: String(codigoEncontrado).trim(),
                descricao: String(descricaoEncontrada).trim(),
                setor: String(item.setor || 'Geral')
            };
        }).filter(p => p.codigo !== "" && p.descricao !== "");
        
        localStorage.setItem("gondola_base_global", JSON.stringify(baseGlobalProdutos));
        alert("🔥 Base Global Atualizada! " + baseGlobalProdutos.length + " produtos salvos.");
        abrirPainelAdmin(); 
    };
    leitor.readAsArrayBuffer(arquivo);
}

// ==========================================
// 2.5. CARREGAR CONFIGURAÇÃO DO CHECKLIST
// ==========================================
function carregarConfigChecklist(input) {
    if (!input.files || input.files.length === 0) return;

    let file = input.files[0];
    let reader = new FileReader();

    reader.onload = function (e) {
        try {
            let data = new Uint8Array(e.target.result);
            let workbook = XLSX.read(data, { type: "array" });

            let firstSheetName = workbook.SheetNames[0];
            let worksheet = workbook.Sheets[firstSheetName];

            let linhas = XLSX.utils.sheet_to_json(worksheet);

            if (linhas.length === 0) {
                alert("⚠️ A planilha de checklist está vazia!");
                return;
            }

            let perguntasFormatadas = [];

            linhas.forEach((linha, index) => {

                let setorNome =
                    linha["SETOR"] ||
                    linha["Setor"] ||
                    linha["setor"] ||
                    "";

                let perguntaTexto =
                    linha["PERGUNTA"] ||
                    linha["Pergunta"] ||
                    linha["pergunta"] ||
                    "";

                let ehDiariaRaw =
                    linha["DIARIA"] ||
                    linha["Diaria"] ||
                    linha["DIÁRIA"] ||
                    linha["diaria"] ||
                    "NÃO";

                if (setorNome && perguntaTexto) {
                    perguntasFormatadas.push({
                        id: Date.now() + index,
                        setor: String(setorNome).trim(),
                        pergunta: String(perguntaTexto).trim(),
                        diaria: String(ehDiariaRaw).trim().toUpperCase() === "SIM"
                    });
                }

            });

            localStorage.setItem(
                "gondola_checklist_config",
                JSON.stringify(perguntasFormatadas)
            );

            alert(
                `✅ Sucesso! ${perguntasFormatadas.length} perguntas de checklist foram importadas.`
            );

            abrirPainelAdmin();

        } catch (erro) {
            console.error(erro);
            alert("❌ Erro ao ler o arquivo Excel.");
        }
    };

    reader.readAsArrayBuffer(file);
}

// ==========================================
// 3. FUNÇÃO DE LOGIN
// ==========================================
function entrar() {
    let campoNome = document.getElementById("nome");
    let campoMatricula = document.getElementById("matricula");

    if (!campoNome || !campoMatricula) {
        alert("Erro técnico: Elementos de login não encontrados.");
        return;
    }

    let nome = campoNome.value.trim();
    let matricula = campoMatricula.value.trim().toLowerCase();

    if (nome === "" || matricula === "") {
        alert("Preencha Nome e Matrícula.");
        return;
    }

    if (matricula === "admin" || nome.toLowerCase() === "admin") {
        usuarioAtual = "Administrador";
        abrirPainelAdmin();
        return; 
    } 
    
    usuarioAtual = nome;
    voltarMenuPrincipal();
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

            <label for="matricula">Matrícula / Senha:</label>
            <input type="password" id="matricula" placeholder="Digite sua matrícula (ou 'admin')">

            <button onclick="entrar()" style="background-color: #28a745; color: white;">Entrar no Sistema</button>
        </div>
    `;
}

// ==========================================================
// 4. TELA DO ADMINISTRADOR (PAINEL DE GESTÃO) - COM GAVETA RETRÁTIL
// ==========================================================
function abrirPainelAdmin() {
    let registros = JSON.parse(localStorage.getItem("registro_validades")) || [];
    let hoje = new Date();
    
    let vencendoLogo = registros.filter(r => {
        if (r.status === "Resolvido") return false;
        if (!r.dataValidade) return false;
        
        let [d, m, a] = r.dataValidade.split('/');
        let dataVenc = new Date(a, m - 1, d);
        let diferencaDias = Math.ceil((dataVenc - hoje) / (1000 * 60 * 60 * 24));
        
        return diferencaDias >= 0 && diferencaDias <= 15;
    });

    let avisoHtml = "";
    if (vencendoLogo.length > 0) {
        avisoHtml = `
            <div style="background:#dc3545; color:white; padding:15px; margin-bottom:15px; border-radius:5px; text-align:center; font-weight:bold; border: 1px solid #a71d2a;">
                🚨 ATENÇÃO: ${vencendoLogo.length} item(ns) vencendo em até 15 dias!
            </div>
        `;
    }

    let setoresLista = [
        { nome: 'Mercearia Bebidas', icone: '🥤' }, { nome: 'Mercearia Doce', icone: '🍬' },
        { nome: 'Mercearia Conservas', icone: '🥫' }, { nome: 'Mercearia Alto Giro', icone: '🔄' },
        { nome: 'Mercearia Limpeza', icone: '🧴' }, { nome: 'Frios Iogurte', icone: '🥛' },
        { nome: 'Frios Congelados', icone: '🧊' }, { nome: 'Açougue', icone: '🥩' },
        { nome: 'Padaria', icone: '🍞' }
    ];

    let blocosInputsSetores = "";
    setoresLista.forEach(s => {
        let contagem = 0;
        try {
            if (typeof missoesPorSetor !== 'undefined' && missoesPorSetor[s.nome]) {
                contagem = missoesPorSetor[s.nome].length;
            }
        } catch(e) {
            contagem = 0;
        }

        blocosInputsSetores += `
            <div style="margin-bottom: 12px; border-bottom: 1px solid #f0f0f0; padding-bottom: 8px;">
                <label><strong>${s.icone} ${s.nome}</strong> (${contagem} itens)</label>
                <input type="file" onchange="carregarPlanilhaSetor(this, '${s.nome}')" style="width: 100%; font-size: 11px;">
            </div>
        `;
    });

    let blocoBaseGlobal = `
        <div style="margin-top: 15px; padding: 10px; background: #fff3cd; border: 1px dashed #ffc107; border-radius: 5px;">
            <label style="font-weight: bold; color: #856404;">🔥 ATUALIZAR BASE GLOBAL</label>
            <input type="file" onchange="carregarBaseGlobal(this)" style="width: 100%; font-size: 11px; margin-top: 5px;">
        </div>
    `;

    let blocoChecklist = `
        <div style="margin-top:15px; padding:10px; background:#d1ecf1; border:1px dashed #0c5460; border-radius:5px;">
            <label style="font-weight:bold; color:#0c5460;">📋 ATUALIZAR CONFIGURAÇÃO DE CHECKLISTS</label>
            <input type="file" onchange="carregarConfigChecklist(this)" style="width:100%; font-size:11px; margin-top: 5px;">
        </div>
    `;

    let blocoRotasEntrega = `
        <div style="margin-top:15px; padding:10px; background:#e2f0d9; border:1px dashed #385723; border-radius:5px;">
            <label style="font-weight:bold; color:#385723;">🚚 ATUALIZAR PLANILHA DE ROTAS (CSV)</label>
            <input type="file" onchange="processarArquivoCSVRotas(this)" style="width:100%; font-size:11px; margin-top: 5px;">
        </div>
    `;

    // MONTAGEM DO CORPO DO RELATÓRIO DE ENTREGAS
    let relatorioEntregasHtml = "";
    try {
        let entregas = JSON.parse(localStorage.getItem("registro_entregas")) || [];
        let total = entregas.length;
        let pendentes = entregas.filter(e => e.status === "Pendente").length;
        let entregues = entregas.filter(e => e.status === "Entregue").length;
        let problemas = entregas.filter(e => e.status === "Não Recebida" || e.status === "Não Localizada").length;

        relatorioEntregasHtml = `
            <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 5px; margin-bottom: 10px; text-align: center; font-size:12px;">
                <div style="background:#f8f9fa; padding:5px; border-radius:4px; border:1px solid #ddd;">Total<br><strong>${total}</strong></div>
                <div style="background:#e6f2ff; padding:5px; border-radius:4px; border:1px solid #b6d4fe; color:#004085;">Pend.<br><strong>${pendentes}</strong></div>
                <div style="background:#d1e7dd; padding:5px; border-radius:4px; border:1px solid #badbcc; color:#0f5132;">Ok<br><strong>${entregues}</strong></div>
                <div style="background:#f8d7da; padding:5px; border-radius:4px; border:1px solid #f5c2c7; color:#842029;">Erro<br><strong>${problemas}</strong></div>
            </div>
            <div style="max-height: 200px; overflow-y: auto; border: 1px solid #eee; border-radius: 4px; background: white;">
                <table style="width: 100%; border-collapse: collapse; font-size: 11px; text-align: left;">
                    <thead>
                        <tr style="background: #efefef; color: #333; position: sticky; top: 0;">
                            <th style="padding: 6px;">Cliente</th>
                            <th style="padding: 6px;">Rota/Bairro</th>
                            <th style="padding: 6px; text-align:center;">Vol.</th>
                            <th style="padding: 6px; text-align:center;">Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${total === 0 ? `<tr><td colspan="4" style="padding:10px; text-align:center; color:#999;">Nenhuma entrega lançada.</td></tr>` : ""}
                        ${entregas.map(e => {
                            let cStatus = "#ffc107";
                            if (e.status === "Entregue") cStatus = "#28a745";
                            if (e.status === "Não Recebida" || e.status === "Não Localizada") cStatus = "#dc3545";
                            
                            // Correção para evitar exibir 'undefined' caso a propriedade varie de nome
                            let rotaNome = e.rota || e.ROTA || "1";

                            return `
                                <tr style="border-bottom: 1px solid #f9f9f9;">
                                    <td style="padding: 6px;"><b>${e.cliente}</b><br><span style="color:#777; font-size:10px;">${e.rua}, ${e.numero}</span></td>
                                    <td style="padding: 6px;">R. ${rotaNome}<br><span style="color:#777; font-size:10px;">${e.bairro}</span></td>
                                    <td style="padding: 6px; text-align:center;">${e.caixas}</td>
                                    <td style="padding: 6px; text-align:center;"><span style="background:${cStatus}; color:white; padding:2px 4px; border-radius:3px; font-weight:bold; font-size:9px;">${e.status}</span></td>
                                </tr>
                            `;
                        }).join("")}
                    </tbody>
                </table>
            </div>
            ${total > 0 ? `
                <div style="text-align:right; margin-top:5px;">
                    <span onclick="if(confirm('Limpar registros de hoje?')){localStorage.removeItem('registro_entregas'); abrirPainelAdmin();}" style="color:#dc3545; font-size:10px; cursor:pointer; text-decoration:underline;">🗑️ Limpar Entregas</span>
                </div>
            ` : ""}
        `;
    } catch(err) {
        relatorioEntregasHtml = "<p style='color:red; font-size:11px;'>Erro ao carregar dados de entrega.</p>";
    }

    let container = document.querySelector(".container");
    if (container) {
        container.innerHTML = `
            ${avisoHtml}
            <div class="topo"><h1>⚙️ PAINEL DO ADMINISTRADOR</h1></div>
            <div class="login" style="text-align: left; max-width: 100%;">
                
                <h3 style="margin-top:0; border-bottom:1px solid #ccc; padding-bottom:5px;">Auditorias de Gôndola (20 Itens)</h3>
                <div style="display: flex; gap: 10px; margin-bottom: 15px; flex-wrap: wrap;">
                    <button onclick="abrirMenuSetoresGerente()" style="background:#17a2b8; color:white; flex: 1; min-width: 120px;">🚨 Fila de Rupturas</button>
                    <button onclick="abrirHistoricoMissoesGerente()" style="background:#007bff; color:white; flex: 1; min-width: 120px; font-weight:bold;">📊 Histórico de Missões</button>
                    <button onclick="abrirHistoricoTratativasGerente()" style="background:#28a745; color:white; flex: 1; min-width: 120px; font-weight:bold;">📋 Histórico de Tratativas</button>
                </div>

                <h3 style="margin-top:15px; border-bottom:1px solid #ccc; padding-bottom:5px;">Checklists Operacionais</h3>
                <div style="display: flex; gap: 10px; margin-bottom: 15px; flex-wrap: wrap;">
                    <button id="btn-responder-checklist" style="background:#6f42c1; color:white; flex: 1; min-width: 120px;">📋 Responder Checklist</button>
                    <button id="btn-historico-checklist" style="background:#fd7e14; color:white; flex: 1; min-width: 120px; font-weight: bold;">📊 Histórico Checklist</button>
                </div>
                
                <h3 style="margin-top:15px; border-bottom:1px solid #ccc; padding-bottom:5px;">Validades</h3>
                <button onclick="abrirRelatorioValidadesGerente()" style="background:#20c997; color:white; width:100%; margin-bottom:15px;">📅 Controlar Vencimentos</button>
                
                <!-- NOVO: BOTÃO DA GAVETA DE ENTREGAS -->
                <button onclick="alternarVisibilidadeEntregas()" id="btn-toggle-entregas" style="background:#0275d8; color:white; width:100%; margin-bottom:15px; font-weight:bold;">📊 Monitoramento de Entregas (Abrir)</button>
                
                <!-- GAVETA DE ENTREGAS (INICIA ESCONDIDA) -->
                <div id="container-entregas-monitor" style="display: none; background: #f8f9fa; padding: 10px; border: 1px solid #dee2e6; border-radius: 5px; margin-bottom:15px;">
                    ${relatorioEntregasHtml}
                </div>
                
                <button onclick="alternarVisibilidadeFicheiros()" id="btn-toggle-ficheiros" style="background:#495057; color:white; width:100%; margin: 15px 0;">📂 Importar Planilhas / Ficheiros (Abrir)</button>
                
                <div id="container-ficheiros-upload" style="display: none; background: #f8f9fa; padding: 10px; border: 1px solid #dee2e6; border-radius: 5px;">
                    ${blocosInputsSetores}
                    ${blocoBaseGlobal}
                    ${blocoChecklist}
                    ${blocoRotasEntrega}
                </div>

                <button onclick="mostrarTelaLoginInicial()" style="background:#6c757d; color:white; width: 100%; margin-top: 20px;">Voltar ao Menu Principal</button>
            </div>
        `;

        document.getElementById("btn-responder-checklist").addEventListener("click", abrirMenuChecklistsGerente);
        document.getElementById("btn-historico-checklist").addEventListener("click", function() {
            abrirHistoricoChecklistsGerente();
        });
    }
}

// ==========================================================
// FUNÇÃO PARA RECOLHER / MOSTRAR O MONITOR DE ENTREGAS
// ==========================================================
function alternarVisibilidadeEntregas() {
    let painel = document.getElementById("container-entregas-monitor");
    let botao = document.getElementById("btn-toggle-entregas");

    if (!painel || !botao) return;

    if (painel.style.display === "none" || painel.style.display === "") {
        painel.style.display = "block";
        botao.innerHTML = "📊 Monitoramento de Entregas (Fechar)";
    } else {
        painel.style.display = "none";
        botao.innerHTML = "📊 Monitoramento de Entregas (Abrir)";
    }
}

mostrarTelaLoginInicial();
// 4.5. MOSTRAR / OCULTAR PAINEL DE IMPORTAÇÃO
// ==========================================
function alternarVisibilidadeFicheiros() {
    let painel = document.getElementById("container-ficheiros-upload");
    let botao = document.getElementById("btn-toggle-ficheiros");

    if (!painel || !botao) return;

    if (painel.style.display === "none" || painel.style.display === "") {
        painel.style.display = "block";
        botao.innerHTML = "📂 Importar Planilhas / Ficheiros (Fechar)";
    } else {
        painel.style.display = "none";
        botao.innerHTML = "📂 Importar Planilhas / Ficheiros (Abrir)";
    }
}
// ==========================================
// 5. MENU PRINCIPAL DO REPOSITOR (USUÁRIO)
// ==========================================
function voltarMenuPrincipal() {
    if (html5QrcodeScanner) {
        try {
            html5QrcodeScanner.clear();
        } catch(e) {}
    }

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

            <button onclick="abrirAbaValidade()" style="background:#20c997; color:white;">
                📅 Verificar Validade (Base Global)
            </button>

            <button onclick="abrirColetorEtiquetas()" style="background:#f0ad4e; color:white; margin-top:10px;">
                🏷️ Coletor de Etiquetas Avulso
            </button>

            <button onclick="abrirAbaEtiquetas()" style="background:#ffc107; color:black; margin-top:10px;">
                🏷️ Etiquetas Pendentes
            </button>

            <hr style="margin:20px 0; border:0; border-top:1px solid #ccc;">

            <h2>🚚 Sistema de Entregas</h2>

            <button onclick="abrirAbaLancamentoEntrega()" style="background:#0275d8; color:white;">
                📦 Lançar Novas Entregas (Fiscal)
            </button>

          <button onclick="abrirAbaMotoristaEntrega()" style="background:#5cb85c; color:white; margin-top:10px; width:100%;">
    🛣️ Entregas para Fazer (Motorista)
</button>

            <button onclick="mostrarTelaLoginInicial()" style="background:#6c757d; color:white; margin-top:20px;">
                ⬅️ Sair do App
            </button>
        </div>
    `;
}

// ==========================================
// 6. SORTEIO ALEATÓRIO DA MISSÃO (MÁX 20 ITENS)
// ==========================================
function prepararMissaoSetor(setor) {
    setorSelecionado = setor;
    indiceAtual = 0;

    let todosDoSetor = missoesPorSetor[setor] || [];

    if (todosDoSetor.length === 0) {
        alert("Atenção: Nenhuma lista de missão foi carregada para o setor: " + setor);
        return;
    }

    let copiaProdutos = JSON.parse(JSON.stringify(todosDoSetor));

    for (let i = copiaProdutos.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [copiaProdutos[i], copiaProdutos[j]] = [copiaProdutos[j], copiaProdutos[i]];
    }

    produtosDoDia = copiaProdutos.slice(0, 20);
    mostrarProdutoAtual();
}

// ==========================================
// 7. CHECKLIST INTERATIVO DE LOJA
// ==========================================
function mostrarProdutoAtual() {

    let container = document.querySelector(".container");
    if (!container) return;

    if (indiceAtual >= produtosDoDia.length) {
        mostrarTelaValidacaoMissao();
        return;
    }

    let produto = produtosDoDia[indiceAtual];

    container.innerHTML = `
    <div class="topo">
        <h1>🛒 GÔNDOLA OK</h1>
        <p>${setorSelecionado} (${indiceAtual + 1}/${produtosDoDia.length})</p>
    </div>

    <div class="login">
        <p><strong>Código:</strong> ${produto.codigo}</p>
        <p><strong>Produto:</strong> ${produto.descricao}</p>
        <br>

        <h3>O produto está abastecido?</h3>

        <button id="btn-abs-sim" onclick="respostaAbastecido(true)" style="background:#e0e0e0;color:black;margin-bottom:8px;">
            🟢 SIM
        </button>

        <button id="btn-abs-nao" onclick="respostaAbastecido(false)" style="background:#e0e0e0;color:black;margin-bottom:8px;">
            🔴 NÃO
        </button>

        <br><br>

        <div id="bloco-preco" style="display:none;">
            <h3>Está precificado?</h3>

            <button id="btn-prc-sim" onclick="respostaPrecificado(true)" style="background:#e0e0e0;color:black;margin-bottom:8px;">
                🟢 SIM
            </button>

            <button id="btn-prc-nao" onclick="respostaPrecificado(false)" style="background:#e0e0e0;color:black;margin-bottom:8px;">
                🔴 NÃO
            </button>

            <br><br>
        </div>

        <button id="btn-proximo" style="display:none;background:#28a745;color:white;width:100%;padding:10px;" onclick="proximoProduto()">
            ➡️ Avançar
        </button>
    </div>
    `;
}

function respostaAbastecido(valor) {
    let produto = produtosDoDia[indiceAtual];
    produto.abastecido = valor;

    document.getElementById("btn-abs-sim").style.background = valor ? "#28a745" : "#e0e0e0";
    document.getElementById("btn-abs-sim").style.color = valor ? "white" : "black";

    document.getElementById("btn-abs-nao").style.background = !valor ? "#dc3545" : "#e0e0e0";
    document.getElementById("btn-abs-nao").style.color = !valor ? "white" : "black";

    let blocoPreco = document.getElementById("bloco-preco");
    let btnProximo = document.getElementById("btn-proximo");

    if (valor) {
        produto.statusRuptura = false;
        blocoPreco.style.display = "block";
        btnProximo.style.display = "none";
    } else {
        produto.statusRuptura = true;
        produto.precificado = "Bloqueado por Ruptura";
        blocoPreco.style.display = "none";
        btnProximo.style.display = "block";
    }
}

function respostaPrecificado(valor) {
    let produto = produtosDoDia[indiceAtual];
    produto.precificado = valor;

    document.getElementById("btn-prc-sim").style.background = valor ? "#28a745" : "#e0e0e0";
    document.getElementById("btn-prc-sim").style.color = valor ? "white" : "black";

    document.getElementById("btn-prc-nao").style.background = !valor ? "#dc3545" : "#e0e0e0";
    document.getElementById("btn-prc-nao").style.color = !valor ? "white" : "black";

    document.getElementById("btn-proximo").style.display = "block";
}

function proximoProduto() {
    produtosDoDia[indiceAtual] = { ...produtosDoDia[indiceAtual] };
    indiceAtual++;
    mostrarProdutoAtual();
}

// ==========================================
// 7.5. NOVA TELA: VALIDAÇÃO DA MISSÃO
// ==========================================
function mostrarTelaValidacaoMissao() {
    let total = produtosDoDia.length;
    let abastecidos = produtosDoDia.filter(p => p.abastecido === true).length;
    let rupturas = produtosDoDia.filter(p => p.statusRuptura === true).length;
    let semPreco = produtosDoDia.filter(p => p.precificado === false).length;

    document.querySelector(".container").innerHTML = `
        <div class="topo">
            <h1>📋 REVISÃO DA MISSÃO</h1>
            <p>${setorSelecionado}</p>
        </div>

        <div class="login" style="max-width:100%; text-align:left;">

            <div style="background:#e9ecef;padding:12px;border-radius:5px;margin-bottom:15px;font-size:14px;line-height:1.6;">
                📊 <strong>Resumo dos Itens Verificados:</strong><br>
                📦 Total: <strong>${total}</strong><br>
                🟢 Abastecidos: <strong style="color:green;">${abastecidos}</strong><br>
                🔴 Rupturas: <strong style="color:red;">${rupturas}</strong><br>
                🏷️ Sem Preço: <strong style="color:#fd7e14;">${semPreco}</strong>
            </div>

            <p style="font-size:12px;color:#6c757d;text-align:center;margin-bottom:15px;">
                ⚠️ Confira as informações antes de gravar.
            </p>

            <div style="display:flex;gap:10px;">
                <button onclick="finalizarEGravarMissao()" style="background:#28a745;color:white;width:60%;padding:12px;font-weight:bold;">
                    ✅ Confirmar e Gravar
                </button>

                <button onclick="if(confirm('Deseja cancelar esta amostragem?')) voltarMenuPrincipal()" style="background:#dc3545;color:white;width:40%;padding:12px;">
                    ❌ Cancelar
                </button>
            </div>

        </div>
    `;
}

// ==========================================
// 8. FINALIZAÇÃO E GRAVAÇÃO REAL DA MISSÃO DIÁRIA
// ==========================================
function finalizarEGravarMissao() {
    let historico = JSON.parse(localStorage.getItem("gondola_dados")) || [];
    let dataAtual = new Date().toLocaleDateString();
    let horaAtual = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    let idSessaoMissao = Date.now();

    let etiquetasPendenteLocal = JSON.parse(localStorage.getItem("etiquetas_pendentes")) || [];
    
    let produtosMapeados = produtosDoDia.map(p => {
        if (p.precificado === false) {
            if (!etiquetasPendenteLocal.some(e => e.codigo === p.codigo)) {
                etiquetasPendenteLocal.push(p);
            }
        }
        
        return {
            ...p,
            id: Date.now() + Math.random(), 
            idSessaoMissao: idSessaoMissao,
            operador: usuarioAtual,
            dataAuditoria: dataAtual,
            horaAuditoria: horaAtual,
            tratadoRuptura: false 
        };
    });

    localStorage.setItem("etiquetas_pendentes", JSON.stringify(etiquetasPendenteLocal));

    historico = historico.concat(produtosMapeados);
    localStorage.setItem("gondola_dados", JSON.stringify(historico));

    document.querySelector(".container").innerHTML = `
        <div class="topo">
            <h1>🛒 GÔNDOLA OK</h1>
            <h2>Missão Gravada!</h2>
        </div>
        <div class="login" style="text-align: center;">
            <p style="color:green; font-weight:bold; font-size:16px;">🎉 Auditoria dos 20 itens processada com sucesso no sistema!</p>
            <button onclick="voltarMenuPrincipal()" style="background-color: #6c757d; color: white; width:100%; padding:10px; margin-top:10px;">Voltar ao Menu</button>
        </div>
    `;
}

// ==========================================
// 9. REPOSITOR: ABA VALIDADE (PRODUTOS) - COMPLETO
// ==========================================
function abrirAbaValidade() {
    document.querySelector(".container").innerHTML = `
        <div class="topo">
            <h1>📅 VERIFICAÇÃO DE VALIDADE</h1>
        </div>
        <div class="login" style="max-width:100%;">
            
            <!-- Botão de Câmera Nativa (À prova de falhas em Android e iOS) -->
            <div style="text-align: center; margin-bottom: 15px;">
                <label for="cameraInputValidade" style="background: #0d6efd; color: white; padding: 12px 15px; border-radius: 5px; font-weight: bold; display: block; cursor: pointer; font-size: 15px;">
                    📷 Abrir Câmera / Tirar Foto
                </label>
                <input type="file" id="cameraInputValidade" accept="image/*" capture="environment" style="display: none;" onchange="processarFotoValidade(this)">
            </div>
            
            <input type="text" id="input-manual-code" placeholder="Digite o código de barras ou nome">
            <button onclick="buscarProdutoValidade(document.getElementById('input-manual-code').value)" style="padding:10px; margin-top:5px; background:#0d6efd; color:white; width:100%; border:none; border-radius:5px; font-weight:bold; cursor:pointer;">🔍 Buscar Produto</button>
            
            <div id="resultado-validade" style="margin-top: 20px; display:none; text-align:left; background:#f9f9f9; padding:15px; border-radius:5px; border: 1px solid #ddd;"></div>
            <br>
            <button onclick="voltarMenuPrincipal()" style="background:#6c757d; color:white; width:100%; padding:10px; border:none; border-radius:5px; font-weight:bold; cursor:pointer;">⬅️ Voltar ao Menu</button>
        </div>
    `;
}

function processarFotoValidade(input) {
    if (input.files && input.files[0]) {
        let display = document.getElementById("resultado-validade");
        display.style.display = "block";
        display.innerHTML = `<p style="text-align:center; color:#28a745; font-weight:bold;">✅ Foto capturada! Digite o código do produto acima para continuar.</p>`;
    }
}

async function buscarProdutoValidade(codigoBarras) {
    let codigoLimpo = codigoBarras ? codigoBarras.trim() : "";
    let display = document.getElementById("resultado-validade");
    display.style.display = "block";

    if (!codigoLimpo) {
        display.innerHTML = `<p style="color:red; text-align:center;">❌ Digite ou escaneie um código válido.</p>`;
        return;
    }

    display.innerHTML = `<p style="text-align:center; color:#6c757d;">🔍 Buscando produto na planilha...</p>`;

    try {
        let resposta = await fetch(`${URL_API_GAS}?acao=buscarProduto&codigo=${codigoLimpo}`);
        let resultado = await resposta.json();

        if (!resultado || !resultado.encontrado) {
            display.innerHTML = `<p style="color:red; text-align:center;">❌ Produto não localizado no Cadastro Geral da Planilha.</p>`;
            return;
        }

        let produtoEncontrado = resultado.produto;

        display.innerHTML = `
            <p><strong>Produto:</strong> ${produtoEncontrado.descricao}</p>
            <p><strong>Código:</strong> ${produtoEncontrado.codigo}</p>
            <label><strong>Data de Vencimento:</strong></label>
            <input type="date" id="data-venc" style="width:100%; padding:8px; margin: 10px 0;">
            <label><strong>Quantidade:</strong></label>
            <input type="number" id="qtd-venc" value="1" style="width:100%; padding:8px; margin: 10px 0;">
            <button onclick="salvarDataValidade('${produtoEncontrado.codigo}', '${produtoEncontrado.descricao.replace(/'/g, "\\'")}')" style="background:#28a745; color:white; width:100%; padding:10px; border:none; border-radius:5px; font-weight:bold;">Salvar Data e Qtd</button>
        `;
    } catch (e) {
        let baseMestre = JSON.parse(localStorage.getItem("gondola_base_global")) || [];
        let produtoEncontrado = baseMestre.find(p => p.codigo === codigoLimpo);

        if (!produtoEncontrado) {
            display.innerHTML = `<p style="color:red; text-align:center;">❌ Erro ao consultar a planilha e produto não encontrado localmente.</p>`;
            return;
        }

        display.innerHTML = `
            <p><strong>Produto:</strong> ${produtoEncontrado.descricao}</p>
            <p><strong>Código:</strong> ${produtoEncontrado.codigo}</p>
            <label><strong>Data de Vencimento:</strong></label>
            <input type="date" id="data-venc" style="width:100%; padding:8px; margin: 10px 0;">
            <label><strong>Quantidade:</strong></label>
            <input type="number" id="qtd-venc" value="1" style="width:100%; padding:8px; margin: 10px 0;">
            <button onclick="salvarDataValidade('${produtoEncontrado.codigo}', '${produtoEncontrado.descricao.replace(/'/g, "\\'")}')" style="background:#28a745; color:white; width:100%; padding:10px; border:none; border-radius:5px; font-weight:bold;">Salvar Data e Qtd</button>
        `;
    }
}

function salvarDataValidade(codigo, descricao) {
    let data = document.getElementById("data-venc").value;
    let qtd = document.getElementById("qtd-venc").value;
    if(!data) { alert("Escolha uma data!"); return; }
    
    let registros = JSON.parse(localStorage.getItem("registro_validades")) || [];
    let partes = data.split("-");
    let dataFormatada = `${partes[2]}/${partes[1]}/${partes[0]}`;

    registros.push({ 
        codigo: codigo, 
        descricao: descricao,
        dataValidade: dataFormatada,
        quantidade: qtd, 
        status: "Pendente", 
        dataRegistro: new Date().toLocaleDateString() 
    });
    localStorage.setItem("registro_validades", JSON.stringify(registros));
    
    alert("Salvo! Quantidade: " + qtd);
    abrirAbaValidade(); 
}
// ==========================================
// 10. REPOSITOR: ABA PREÇOS (MANUAL) - NUVEM / GOOGLE SHEETS
// ==========================================
async function abrirAbaEtiquetas() {
    document.querySelector(".container").innerHTML = `
        <div class="topo">
            <h1>🏷️ PRODUTOS SEM PREÇO</h1>
            <p>Carregando dados da nuvem...</p>
        </div>
        <div class="login" style="max-width:100%; text-align:center; padding: 20px;">
            <p style="color:#6c757d;">⏳ Sincronizando com a planilha...</p>
        </div>
    `;

    let etiquetas = [];
    try {
        let resposta = await fetch(`${URL_API_GAS}?acao=listarEtiquetas`);
        let resultado = await resposta.json();
        if (resultado && resultado.etiquetas) {
            etiquetas = resultado.etiquetas;
        }
    } catch (e) {
        etiquetas = JSON.parse(localStorage.getItem("etiquetas_pendentes")) || [];
    }

    let lines = "";
    if (etiquetas.length === 0) {
        lines = `<tr><td colspan="2" style="text-align:center; padding:20px; color: green; font-weight: bold;">🎉 Nenhum produto sem preço pendente!</td></tr>`;
    } else {
        etiquetas.forEach((e, idx) => {
            lines += `
                <tr style="border-bottom: 1px solid #ddd;">
                    <td style="padding:12px; font-size:14px; line-height: 1.4;">
                        <strong>${e.descricao}</strong><br>
                        <span style="font-family: monospace; font-size: 15px; color: #333; background: #eee; padding: 2px 6px; border-radius: 3px;">
                            ${e.codigo}
                        </span>
                    </td>
                    <td style="padding:12px; text-align:center; width: 90px;">
                        <button onclick="darBaixaEtiquetaNuvem('${e.codigo}')" style="background:#28a745; color:white; padding:8px 10px; font-size:12px; border:none; border-radius:4px; font-weight:bold; cursor:pointer;">
                            ✓ Feito
                        </button>
                    </td>
                </tr>
            `;
        });
    }

    document.querySelector(".container").innerHTML = `
        <div class="topo">
            <h1>🏷️ PRODUTOS SEM PREÇO</h1>
            <p>Sincronizado com a Planilha Geral</p>
        </div>
        <div class="login" style="max-width:100%; padding: 0;">
            <div style="background: #e2e3e5; padding: 10px; border-radius: 5px; margin-bottom: 15px; font-size: 13px; color: #383d41; text-align: center;">
                📋 <strong>Total pendente na nuvem: ${etiquetas.length} itens</strong>
            </div>
            
            <table style="width:100%; border-collapse:collapse; text-align:left; background: white;">
                <thead>
                    <tr style="background:#f2f2f2; border-bottom: 2px solid #ccc;">
                        <th style="padding:10px; font-size: 13px;">Produto / Código de Barras</th>
                        <th style="padding:10px; text-align:center; font-size: 13px;">Ação</th>
                    </tr>
                </thead>
                <tbody>${lines}</tbody>
            </table>
            <br>
            <button onclick="voltarMenuPrincipal()" style="background:#6c757d; color:white; width:100%; padding:10px; border:none; border-radius:5px; font-weight:bold;">⬅️ Voltar ao Menu</button>
        </div>
    `;
}

async function darBaixaEtiquetaNuvem(codigoProduto) {
    if (!confirm("Deseja realmente dar baixa nesta etiqueta?")) return;

    document.querySelector(".container").innerHTML = `
        <div class="topo">
            <h1>🏷️ PRODUTOS SEM PREÇO</h1>
            <p>Atualizando na nuvem...</p>
        </div>
        <div class="login" style="max-width:100%; text-align:center; padding: 20px;">
            <p style="color:#6c757d;">⏳ Salvando alteração na planilha...</p>
        </div>
    `;

    try {
        await fetch(`${URL_API_GAS}?acao=darBaixaEtiqueta&codigo=${codigoProduto}`, {
            method: 'POST'
        });
    } catch (e) {
        let etiquetas = JSON.parse(localStorage.getItem("etiquetas_pendentes")) || [];
        etiquetas = etiquetas.filter(e => e.codigo !== codigoProduto);
        localStorage.setItem("etiquetas_pendentes", JSON.stringify(etiquetas));
    }

    abrirAbaEtiquetas();
}

// ==========================================
// 11. GESTÃO DE VALIDADES: GERENTE (FILTRADO POR HOJE) - NUVEM / GOOGLE SHEETS
// ==========================================
async function abrirRelatorioValidadesGerente() {
    document.querySelector(".container").innerHTML = `
        <div class="topo"><h1>📅 GESTÃO DE VALIDADES</h1></div>
        <div class="login" style="max-width: 100%; text-align: center; padding: 20px;">
            <p style="color:#6c757d;">⏳ Carregando relatórios de validade da nuvem...</p>
        </div>
    `;

    let todosRegistros = [];
    let hojeStr = new Date().toLocaleDateString();

    try {
        let resposta = await fetch(`${URL_API_GAS}?acao=listarValidades`);
        let resultado = await resposta.json();
        if (resultado && resultado.registros) {
            todosRegistros = resultado.registros;
        }
    } catch (e) {
        todosRegistros = JSON.parse(localStorage.getItem("registro_validades")) || [];
    }
    
    let registros = todosRegistros.filter(r => r.status !== "Resolvido" && r.dataRegistro === hojeStr); 
    let linhas = "";

    if (registros.length === 0) {
        linhas = `<tr><td colspan="4" style="text-align:center; padding:20px; color: green; font-weight: bold;">🎉 Nenhum registro de validade pendente para hoje!</td></tr>`;
    } else {
        registros.forEach((r) => {
            let estiloTratado = r.status === "Tratado" ? "background:#e8f4fd;" : "background:#ffffff;";
            let qtd = r.quantidade || 1; 

            linhas += `
                <tr style="${estiloTratado} border-bottom: 1px solid #ddd; font-size: 13px;">
                    <td style="padding: 10px;"><strong>${r.descricao}</strong><br><small>Cód: ${r.codigo}</small></td>
                    <td style="padding: 10px; text-align:center; color:red; font-weight:bold;">${r.dataValidade}</td>
                    <td style="padding: 10px; text-align:center;">${qtd}</td>
                    <td style="padding: 10px; text-align:center;">
                        <button onclick="atualizarStatusNuvem('${r.codigo}', '${r.dataValidade}', 'Tratado')" style="background:#007bff; color:white; border:none; padding:5px; margin:2px; cursor:pointer;">Tratar</button>
                        <button onclick="atualizarStatusNuvem('${r.codigo}', '${r.dataValidade}', 'Resolvido')" style="background:#28a745; color:white; border:none; padding:5px; margin:2px; cursor:pointer;">Resolver</button>
                    </td>
                </tr>
            `;
        });
    }

    document.querySelector(".container").innerHTML = `
        <div class="topo"><h1>📅 GESTÃO DE VALIDADES</h1></div>
        <div class="login" style="max-width: 100%; padding: 10px;">
            <p style="font-size:12px; color:#495057; text-align:center; background:#e2e3e5; padding:5px; margin-bottom:10px; border-radius:4px;">👁️ Exibindo apenas os registros adicionados <strong>Hoje (${hojeStr})</strong></p>
            <button onclick="exportarParaExcel('Relatorio_Validades_Completo', 'registro_validades')" style="width:100%; background:#6c757d; color:white; padding:10px; margin-bottom:10px;">📥 Exportar Histórico Completo (Excel)</button>
            <table style="width: 100%; border-collapse: collapse;">
                <tr style="background:#f2f2f2;"><th style="padding:8px;">Prod</th><th style="padding:8px;">Venc</th><th style="padding:8px;">Qtd</th><th style="padding:8px;">Ação</th></tr>
                ${linhas}
            </table>
            <button onclick="abrirPainelAdmin()" style="width:100%; margin-top:10px;">Voltar</button>
        </div>
    `;
}

window.atualizarStatusNuvem = async function(codigo, dataValidade, novoStatus) {
    if (!confirm(`Deseja alterar o status para "${novoStatus}"?`)) return;

    try {
        await fetch(`${URL_API_GAS}?acao=atualizarStatusValidade&codigo=${codigo}&dataValidade=${dataValidade}&status=${novoStatus}`, {
            method: 'POST'
        });
        alert("Status atualizado na nuvem: " + novoStatus);
    } catch (e) {
        let registros = JSON.parse(localStorage.getItem("registro_validades")) || [];
        let item = registros.find(r => r.codigo === codigo && r.dataValidade === dataValidade);
        if (item) {
            item.status = novoStatus;
            localStorage.setItem("registro_validades", JSON.stringify(registros));
        }
        alert("Status atualizado localmente: " + novoStatus);
    }
    
    abrirRelatorioValidadesGerente();
};
// ==========================================
// 12. GERENTE: SELEÇÃO DE ABAS AUDITORIA
// ==========================================
function abrirMenuSetoresGerente() {
    document.querySelector(".container").innerHTML = `
        <div class="topo">
            <h1>🚨 FILA DE RUPTURAS CRÍTICAS</h1>
            <p>Selecione o setor para ver apenas o que está em falta</p>
        </div>
        <div class="login">
            <button onclick="abrirAbaGerente('Mercearia Bebidas')" style="background:#dc3545; color:white;">🥤 Mercearia Bebidas</button>
            <button onclick="abrirAbaGerente('Mercearia Doce')" style="background:#dc3545; color:white;">🍬 Mercearia Doce</button>
            <button onclick="abrirAbaGerente('Mercearia Conservas')" style="background:#dc3545; color:white;">🥫 Mercearia Conservas</button>
            <button onclick="abrirAbaGerente('Mercearia Alto Giro')" style="background:#dc3545; color:white;">🔄 Mercearia Alto Giro</button>
            <button onclick="abrirAbaGerente('Mercearia Limpeza')" style="background:#dc3545; color:white;">🧴 Mercearia Limpeza</button>
            <button onclick="abrirAbaGerente('Frios Iogurte')" style="background:#dc3545; color:white;">🥛 Frios Iogurte</button>
            <button onclick="abrirAbaGerente('Frios Congelados')" style="background:#dc3545; color:white;">🧊 Frios Congelados</button>
            <button onclick="abrirAbaGerente('Açougue')" style="background:#dc3545; color:white;">🥩 Açougue</button>
            <button onclick="abrirAbaGerente('Padaria')" style="background:#dc3545; color:white;">🍞 Padaria</button>
            
            <hr style="margin: 20px 0; border: 0; border-top: 1px solid #ccc;">
            <button onclick="abrirPainelAdmin()" style="background-color: #6c757d; color: white; width: 100%;">Voltar ao Painel Admin</button>
        </div>
    `;
}
// ==========================================
// 13. GERENTE: FILA COM ITENS COM RUPTURA ATIVA - NUVEM / GOOGLE SHEETS
// ==========================================
async function abrirAbaGerente(setorFiltro) {
    document.querySelector(".container").innerHTML = `
        <div class="topo">
            <h1>🚨 RUPTURAS: ${setorFiltro.toUpperCase()}</h1>
            <p>Carregando dados da nuvem...</p>
        </div>
        <div class="login" style="max-width: 100%; text-align: center; padding: 20px;">
            <p style="color:#6c757d;">⏳ Buscando rupturas pendentes...</p>
        </div>
    `;

    let dados = [];
    try {
        let resposta = await fetch(`${URL_API_GAS}?acao=listarRupturas&setor=${encodeURIComponent(setorFiltro)}`);
        let resultado = await resposta.json();
        if (resultado && resultado.rupturas) {
            dados = resultado.rupturas;
        }
    } catch (e) {
        let localDados = JSON.parse(localStorage.getItem("gondola_dados")) || [];
        dados = localDados.filter(p => p.setor === setorFiltro);
    }

    let rupturasPendentesSetor = dados.filter(p => p.statusRuptura === true && p.tratadoRuptura !== true);

    let linesTabela = "";
    if (rupturasPendentesSetor.length === 0) {
        linesTabela = `<tr><td colspan="3" style="padding:30px; text-align:center; color:green; font-weight:bold; font-size:14px;">🎉 Excelente! Nenhuma ruptura pendente neste setor.</td></tr>`;
    } else {
        rupturasPendentesSetor.forEach(p => {
            let idFormatado = String(p.id).replace('.', '_');
            linesTabela += `
                <tr style="border-bottom: 1px solid #ddd; font-size: 13px;">
                    <td style="padding: 12px;"><strong>${p.descricao}</strong><br><small style="color:#555;">Cód: ${p.codigo}</small><br><span style="font-size:10px; color:#777;">Auditado em: ${p.dataAuditoria || ''} por ${p.operador || ''}</span></td>
                    <td style="padding: 12px; text-align:center; vertical-align:middle;">
                        <select id="motivo-${idFormatado}" style="padding: 6px; font-size:12px; width: 100%; border:1px solid #ccc; border-radius:4px;">
                            <option value="Não Informado">Definir motivo...</option>
                            <option value="Estoque Zerado">❌ Estoque Zerado</option>
                            <option value="Não Abastecido">⚠️ Não Abastecido</option>
                            <option value="Somente no Sistema">💻 No Sistema</option>
                        </select>
                    </td>
                    <td style="padding: 12px; text-align:center; vertical-align:middle; width:70px;">
                        <button onclick="salvarResolucaoRupturaNuvem('${setorFiltro}', '${p.id}')" style="background:#28a745; color:white; border:none; padding:8px 10px; font-size:12px; font-weight:bold; border-radius:4px; cursor:pointer;">✓ Ok</button>
                    </td>
                </tr>
            `;
        });
    }

    document.querySelector(".container").innerHTML = `
        <div class="topo">
            <h1>🚨 RUPTURAS: ${setorFiltro.toUpperCase()}</h1>
            <p>Painel focado exclusivamente em ações corretivas</p>
        </div>
        <div class="login" style="max-width: 100%; padding: 10px;">
            <table style="width: 100%; border-collapse: collapse; text-align: left; background:white;">
                <thead>
                    <tr style="background-color: #f2f2f2; font-size:12px; border-bottom:2px solid #ccc;">
                        <th style="padding: 10px;">Produto em Falta</th>
                        <th style="padding: 10px;">Motivo da Ocorrência</th>
                        <th style="padding: 10px; text-align:center;">Ação</th>
                    </tr>
                </thead>
                <tbody>${linesTabela}</tbody>
            </table>
            <br>
            <button onclick="abrirMenuSetoresGerente()" style="background-color: #6c757d; color: white; width: 100%;">Voltar aos Setores</button>
        </div>
    `;
}

window.salvarResolucaoRupturaNuvem = async function(setorFiltro, idItem) {
    let idFormatado = String(idItem).replace('.', '_');
    let selectElement = document.getElementById(`motivo-${idFormatado}`);
    let motivoSelecionado = selectElement ? selectElement.value : "Não Informado";

    if (motivoSelecionado === "Não Informado") {
        alert("Por favor, selecione o motivo da ocorrência antes de prosseguir.");
        return;
    }

    try {
        await fetch(`${URL_API_GAS}?acao=tratarRuptura&id=${idItem}&motivo=${encodeURIComponent(motivoSelecionado)}`, {
            method: 'POST'
        });
        alert("Ruptura tratada e salva na nuvem com sucesso!");
    } catch (e) {
        let dados = JSON.parse(localStorage.getItem("gondola_dados")) || [];
        let item = dados.find(p => String(p.id) === String(idItem));
        if (item) {
            item.tratadoRuptura = true;
            item.motivoRuptura = motivoSelecionado;
            localStorage.setItem("gondola_dados", JSON.stringify(dados));
        }
        alert("Ruptura tratada localmente!");
    }

    abrirAbaGerente(setorFiltro);
};
// ==========================================
// 13.1. FUNÇÃO DE SALVAR RESOLUÇÃO DA RUPTURA - NUVEM / GOOGLE SHEETS
// ==========================================
window.salvarResolucaoRuptura = async function(setorOrigem, idItemString) {
    let elMotivo = document.getElementById(`motivo-${idItemString.replace('.', '_')}`);
    let motivoSelecionado = elMotivo ? elMotivo.value : "Não Informado";

    if (motivoSelecionado === "Não Informado") {
        alert("Por favor, selecione o motivo da ocorrência antes de prosseguir.");
        return;
    }

    let dataAtual = new Date().toLocaleDateString();
    let horaAtual = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    let gerenteNome = typeof usuarioAtual !== 'undefined' ? usuarioAtual : "Administrador";

    // Mostra feedback visual rápido de salvamento
    document.querySelector(".container").innerHTML = `
        <div class="topo">
            <h1>🚨 RUPTURAS: ${setorOrigem.toUpperCase()}</h1>
            <p>Salvando tratativa na nuvem...</p>
        </div>
        <div class="login" style="max-width: 100%; text-align: center; padding: 20px;">
            <p style="color:#6c757d;">⏳ Gravando alteração na planilha...</p>
        </div>
    `;

    try {
        let payload = {
            acao: "salvarTratativaRuptura",
            idItem: idItemString,
            motivo: motivoSelecionado,
            gerente: gerenteNome,
            dataTratativa: dataAtual,
            horaTratativa: horaAtual
        };

        await fetch(URL_API_GAS, {
            method: 'POST',
            body: JSON.stringify(payload)
        });

        alert("✅ Tratativa gravada na nuvem com sucesso! O item sairá da lista.");
    } catch (e) {
        // Fallback local caso a rede falhe momentaneamente
        let dados = JSON.parse(localStorage.getItem("gondola_dados")) || [];
        let historicoTratativas = JSON.parse(localStorage.getItem("gondola_historico_tratativas")) || [];
        let item = dados.find(p => String(p.id) === String(idItemString));
        
        if (item) {
            item.finalizacaoGerente = motivoSelecionado;
            item.tratadoRuptura = true; 
            localStorage.setItem("gondola_dados", JSON.stringify(dados));

            historicoTratativas.push({
                idTratativa: Date.now(),
                codigo: item.codigo,
                descricao: item.descricao,
                setor: item.setor,
                operadorOrigem: item.operador,
                dataAuditoria: item.dataAuditoria,
                motivoRuptura: motivoSelecionado,
                gerenteResponsavel: gerenteNome,
                dataTratativa: dataAtual,
                horaTratativa: horaAtual
            });
            localStorage.setItem("gondola_historico_tratativas", JSON.stringify(historicoTratativas));
            alert("⚠️ Sem conexão com a nuvem. Tratativa gravada localmente!");
        } else {
            alert("Erro ao processar item.");
        }
    }
    
    abrirAbaGerente(setorOrigem);
};
// ==========================================
// 13.6. HISTÓRICO DE TRATATIVAS (CLICÁVEL POR DATA) - NUVEM / GOOGLE SHEETS
// ==========================================
async function abrirHistoricoTratativasGerente(dataFiltro = null) {
    let container = document.querySelector(".container");
    if (!container) return;

    let hojeStr = new Date().toLocaleDateString();
    let dataAlvo = hojeStr;

    if (dataFiltro) {
        let partes = dataFiltro.split("-");
        dataAlvo = `${partes[2]}/${partes[1]}/${partes[0]}`;
    }

    container.innerHTML = `
        <div class="topo">
            <h1>📋 HISTÓRICO DE TRATATIVAS</h1>
            <p>Carregando histórico da nuvem...</p>
        </div>
        <div class="login" style="max-width: 100%; text-align: center; padding: 20px;">
            <p style="color:#6c757d;">⏳ Sincronizando tratativas...</p>
        </div>
    `;

    let historico = [];
    try {
        let resposta = await fetch(`${URL_API_GAS}?acao=listarHistoricoTratativas`);
        let resultado = await resposta.json();
        if (resultado && resultado.historico) {
            historico = resultado.historico;
        }
    } catch (e) {
        historico = JSON.parse(localStorage.getItem("gondola_historico_tratativas")) || [];
    }

    let historicoFiltrado = historico.filter(t => t.dataTratativa === dataAlvo);

    let linhasHtml = "";
    if (historicoFiltrado.length === 0) {
        linhasHtml = `<p style="text-align:center; color:#777; padding:30px; background:white; border-radius:4px;">Nenhuma tratativa resolvida nesta data (${dataAlvo}).</p>`;
    } else {
        let historicoInvertido = [...historicoFiltrado].reverse(); 
        historicoInvertido.forEach(t => {
            linhasHtml += `
                <div style="background: white; border: 1px solid #dee2e6; border-radius: 6px; padding: 12px; margin-bottom: 10px; border-left: 5px solid #28a745; text-align:left;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 6px; border-bottom: 1px solid #f8f9fa; padding-bottom:4px;">
                        <span style="font-size:11px; background:#e8f4fd; color:#0056b3; padding:2px 6px; border-radius:3px; font-weight:bold;">${t.setor}</span>
                        <span style="font-size:11px; color:#6c757d;">🛠️ Resolvido às: ${t.horaTratativa}</span>
                    </div>
                    <p style="margin:0 0 6px 0; font-size:13px; color:#222;"><strong>${t.descricao}</strong> <small style="color:#666;">(${t.codigo})</small></p>
                    <div style="font-size:11px; color:#495057; background:#f8f9fa; padding:6px; border-radius:4px; display:flex; flex-direction:column; gap:2px;">
                        <span>❌ <strong>Ruptura:</strong> ${t.motivoRuptura}</span>
                        <span>👤 <strong>Repositores:</strong> ${t.operadorOrigem} (Auditou em ${t.dataAuditoria})</span>
                    </div>
                </div>
            `;
        });
    }

    let partesInput = dataAlvo.split("/");
    let dataInputFormat = `${partesInput[2]}-${partesInput[1]}-${partesInput[0]}`;

    container.innerHTML = `
        <div class="topo">
            <h1>📋 HISTÓRICO DE TRATATIVAS</h1>
            <p>Tratativas do dia: <strong>${dataAlvo}</strong></p>
        </div>
        <div class="login" style="max-width: 100%; max-height: 70vh; overflow-y: auto; padding: 10px;">
            
            <div style="background:#e2e3e5; padding:10px; margin-bottom:15px; border-radius:4px; text-align:center;">
                <label style="font-size:12px; font-weight:bold; color:#495057; display:block; margin-bottom:5px;">📅 CLIQUE ABAIXO PARA CONSULTAR OUTRA DATA:</label>
                <input type="date" value="${dataInputFormat}" onchange="abrirHistoricoTratativasGerente(this.value)" style="padding:6px; font-size:14px; width:80%; max-width:200px; border:1px solid #ccc; border-radius:4px;">
            </div>

            <button onclick="exportarParaExcel('Historico_Tratativas_Geral', 'gondola_historico_tratativas')" style="width:100%; background:#6c757d; color:white; padding:8px; margin-bottom:15px; font-weight:bold;">📥 Exportar Todo o Histórico Mensal (Excel)</button>
            ${linhasHtml}
            <button onclick="abrirPainelAdmin()" style="background:#495057; color:white; width:100%; margin-top:15px;">⬅️ Voltar ao Painel</button>
        </div>
    `;
}

// ==========================================
// 13.7. HISTÓRICO DE LEITURA DAS MISSÕES (CLICÁVEL POR DATA) - NUVEM / GOOGLE SHEETS
// ==========================================
async function abrirHistoricoMissoesGerente(dataFiltro = null) {
    let container = document.querySelector(".container");
    if (!container) return;

    let hojeStr = new Date().toLocaleDateString();
    let dataAlvo = hojeStr;

    if (dataFiltro) {
        let partes = dataFiltro.split("-");
        dataAlvo = `${partes[2]}/${partes[1]}/${partes[0]}`;
    }

    container.innerHTML = `
        <div class="topo">
            <h1>📊 LEITURA DE MISSÕES</h1>
            <p>Carregando histórico da nuvem...</p>
        </div>
        <div class="login" style="max-width: 100%; text-align: center; padding: 20px;">
            <p style="color:#6c757d;">⏳ Sincronizando missões...</p>
        </div>
    `;

    let dados = [];
    try {
        let resposta = await fetch(`${URL_API_GAS}?acao=listarMissoes`);
        let resultado = await resposta.json();
        if (resultado && resultado.dados) {
            dados = resultado.dados;
        }
    } catch (e) {
        dados = JSON.parse(localStorage.getItem("gondola_dados")) || [];
    }

    let sessoesMapeadas = {};
    dados.forEach(item => {
        if (item.dataAuditoria === dataAlvo) {
            let id = item.idSessaoMissao || (item.dataAuditoria + "_" + item.setor); 
            if (!sessoesMapeadas[id]) {
                sessoesMapeadas[id] = {
                    idSessao: id,
                    setor: item.setor,
                    operador: item.operador || "Não Informado",
                    data: item.dataAuditoria,
                    hora: item.horaAuditoria || "--:--",
                    produtos: []
                };
            }
            sessoesMapeadas[id].produtos.push(item);
        }
    });

    let listaSessoes = Object.values(sessoesMapeadas).reverse(); 

    let linesHtml = "";
    if (listaSessoes.length === 0) {
        linesHtml = `<p style="text-align:center; color:#777; padding:20px;">Nenhuma amostragem de gôndola foi auditada em ${dataAlvo}.</p>`;
    } else {
        listaSessoes.forEach(s => {
            let total = s.produtos.length;
            let rupturas = s.produtos.filter(p => p.statusRuptura === true).length;
            let semPreco = s.produtos.filter(p => p.precificado === false).length;
            let conformes = total - rupturas;

            linesHtml += `
                <div onclick="verDetalhesMissao('${s.idSessao}')" style="background: white; border: 1px solid #dee2e6; border-radius: 6px; padding: 12px; margin-bottom: 10px; cursor: pointer; border-left: 5px solid #007bff; transition: 0.2s; text-align:left;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 4px;">
                        <strong style="color: #333; font-size:14px;">${s.setor}</strong>
                        <span style="font-size:11px; color:#6c757d;">Horário: ${s.hora}</span>
                    </div>
                    <div style="font-size:12px; color:#495057; display:flex; justify-content:space-between;">
                        <span>👤 Op: ${s.operador}</span>
                        <span>🟢 ${conformes} | 🔴 Rup: ${rupturas} | 🏷️ Etq: ${semPreco}</span>
                    </div>
                </div>
            `;
        });
    }

    let partesInput = dataAlvo.split("/");
    let dataInputFormat = `${partesInput[2]}-${partesInput[1]}-${partesInput[0]}`;

    container.innerHTML = `
        <div class="topo">
            <h1>📊 LEITURA DE MISSÕES</h1>
            <p>Missões do dia: <strong>${dataAlvo}</strong></p>
        </div>
        <div class="login" style="max-width: 100%; max-height: 70vh; overflow-y: auto; padding: 10px;">
            
            <div style="background:#e2e3e5; padding:10px; margin-bottom:15px; border-radius:4px; text-align:center;">
                <label style="font-size:12px; font-weight:bold; color:#495057; display:block; margin-bottom:5px;">📅 CLIQUE ABAIXO PARA CONSULTAR OUTRA DATA:</label>
                <input type="date" value="${dataInputFormat}" onchange="abrirHistoricoMissoesGerente(this.value)" style="padding:6px; font-size:14px; width:80%; max-width:200px; border:1px solid #ccc; border-radius:4px;">
            </div>

            <button onclick="exportarParaExcel('Historico_Geral_Missoes', 'gondola_dados')" style="width:100%; background:#6c757d; color:white; padding:8px; margin-bottom:15px; font-weight:bold;">📥 Exportar Toda a Base Histórica (Excel)</button>
            ${linesHtml}
            <button onclick="abrirPainelAdmin()" style="background:#495057; color:white; width:100%; margin-top:15px;">⬅️ Voltar ao Painel</button>
        </div>
    `;
}

// ==========================================
// 13.8. DETALHES DA MISSÃO - NUVEM / GOOGLE SHEETS
// ==========================================
window.verDetalhesMissao = async function(idSessao) {
    let container = document.querySelector(".container");
    if (!container) return;

    container.innerHTML = `
        <div class="topo">
            <h1>📋 DETALHES DA MISSÃO</h1>
            <p>Carregando detalhes da nuvem...</p>
        </div>
        <div class="login" style="max-width: 100%; text-align: center; padding: 20px;">
            <p style="color:#6c757d;">⏳ Buscando dados da missão...</p>
        </div>
    `;

    let dados = [];
    try {
        let resposta = await fetch(`${URL_API_GAS}?acao=listarMissoes`);
        let resultado = await resposta.json();
        if (resultado && resultado.dados) {
            dados = resultado.dados;
        }
    } catch (e) {
        dados = JSON.parse(localStorage.getItem("gondola_dados")) || [];
    }

    let produtosSessao = dados.filter(p => (p.idSessaoMissao == idSessao || (p.dataAuditoria + "_" + p.setor) == idSessao));
    
    if (produtosSessao.length === 0) {
        alert("Nenhum produto encontrado para esta sessão.");
        abrirHistoricoMissoesGerente();
        return;
    }

    let infoBase = produtosSessao[0];
    let itensHtml = "";

    produtosSessao.forEach((p, index) => {
        let absBadge = p.abastecido ? `<span style="color:green; font-weight:bold;">🟢 Abastecido</span>` : `<span style="color:red; font-weight:bold;">🔴 RUPTURA</span>`;
        let prcBadge = p.precificado === true ? `| Preço: <span style="color:green;">🟢 OK</span>` : (p.precificado === false ? `| Preço: <span style="color:red; font-weight:bold;">🔴 SEM ETIQUETA</span>` : `| Preço: <span style="color:gray;">⚠️ N/A</span>`);
        let tratativa = p.finalizacaoGerente ? `<br><span style="color:#28a745; font-size:11px;">🛠️ Solução: <strong>${p.finalizacaoGerente}</strong></span>` : "";

        itensHtml += `
            <div style="padding: 10px 0; border-bottom: 1px solid #eee; font-size: 13px;">
                <p style="margin: 0 0 5px 0;"><strong>${index + 1}. ${p.descricao}</strong> <small style="color:#777;">(${p.codigo})</small></p>
                <div style="background:#f8f9fa; padding:6px; border-radius:4px; font-size:12px;">
                    ${absBadge} ${prcBadge}
                    ${tratativa}
                </div>
            </div>
        `;
    });

    container.innerHTML = `
        <div class="topo">
            <h1>📋 DETALHES DA MISSÃO</h1>
            <p>${infoBase.setor}</p>
        </div>
        <div class="login" style="max-width: 100%; max-height: 70vh; overflow-y: auto; text-align:left; padding: 15px;">
            <div style="background:#e9ecef; padding:8px; border-radius:4px; font-size:12px; margin-bottom:15px; color:#495057;">
                👤 <strong>Operador:</strong> ${infoBase.operador || "Não Informado"}<br>
                📅 <strong>Data:</strong> ${infoBase.dataAuditoria} às ${infoBase.horaAuditoria || "--:--"}<br>
            </div>
            ${itensHtml}
            <button onclick="abrirHistoricoMissoesGerente()" style="background:#6c757d; color:white; width:100%; margin-top:20px;">⬅️ Voltar ao Histórico</button>
        </div>
    `;
};
// ==========================================
// 17. GRAVAÇÃO DAS RESPOSTAS DO CHECKLIST - NUVEM / GOOGLE SHEETS
// ==========================================
async function salvarRespostasChecklist(nomeSetor) {
    let dataAtual = new Date().toLocaleDateString();
    let horaAtual = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    let usuarioLogado = typeof usuarioAtual !== 'undefined' ? usuarioAtual : "Administrador";
    let sessaoId = Date.now();

    let novasRespostas = [];
    if (typeof perguntasAtivasChecklist !== 'undefined') {
        perguntasAtivasChecklist.forEach(p => {
            let elResposta = document.getElementById(`resp-checklist-${p.id}`);
            let elObservacao = document.getElementById(`obs-checklist-${p.id}`);
            if (elResposta) {
                novasRespostas.push({
                    perguntaId: p.id,
                    perguntaTexto: p.pergunta,
                    resposta: elResposta.value,
                    observacao: elObservacao ? elObservacao.value.trim() : ""
                });
            }
        });
    }

    if (novasRespostas.length === 0) {
        alert("Nenhuma resposta coletada.");
        return;
    }

    let payloadChecklist = {
        idSessao: sessaoId,
        setor: nomeSetor,
        usuario: usuarioLogado,
        data: dataAtual,
        hora: horaAtual,
        itensRespondidos: novasRespostas
    };

    // Salva localmente como backup/fallback imediato
    let historicoChecklists = JSON.parse(localStorage.getItem("gondola_historico_checklists")) || [];
    historicoChecklists.push(payloadChecklist);
    localStorage.setItem("gondola_historico_checklists", JSON.stringify(historicoChecklists));

    // Envio para a nuvem (Google Sheets via Apps Script)
    try {
        if (typeof URL_API_GAS !== 'undefined' && URL_API_GAS) {
            await fetch(URL_API_GAS, {
                method: "POST",
                mode: "no-cors",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    acao: "salvarChecklist",
                    ...payloadChecklist
                })
            });
        }
    } catch (e) {
        console.warn("Erro ao sincronizar checklist com a nuvem, salvo apenas localmente.", e);
    }

    alert(`✅ Checklist do setor "${nomeSetor}" gravado com sucesso!`);
    abrirMenuChecklistsGerente();
}

// ==========================================
// 18. HISTÓRICO DE CHECKLISTS - NUVEM / GOOGLE SHEETS
// ==========================================
async function abrirHistoricoChecklistsGerente(dataFiltro = null) {
    let container = document.querySelector(".container");
    if (!container) return;

    let dataSelecionada = new Date().toLocaleDateString();

    if (dataFiltro) {
        let p = dataFiltro.split("-");
        dataSelecionada = `${p[2]}/${p[1]}/${p[0]}`;
    }

    container.innerHTML = `
        <div class="topo"><h1>📋 HISTÓRICO DE CHECKLISTS</h1></div>
        <div class="login" style="max-width: 100%; text-align: center; padding: 20px;">
            <p style="color:#6c757d;">⏳ Sincronizando histórico da nuvem...</p>
        </div>
    `;

    let historico = [];
    try {
        if (typeof URL_API_GAS !== 'undefined' && URL_API_GAS) {
            let resposta = await fetch(`${URL_API_GAS}?acao=listarHistoricoChecklists`);
            let resultado = await resposta.json();
            if (resultado && resultado.historico) {
                historico = resultado.historico;
            }
        } else {
            throw new Error("URL_API_GAS não configurada");
        }
    } catch (e) {
        historico = JSON.parse(localStorage.getItem("gondola_historico_checklists")) || [];
    }

    let lista = historico.filter(item => item.data === dataSelecionada).sort((a,b) => b.idSessao - a.idSessao);
    let html = lista.length === 0 ? '<div style="padding:25px; text-align:center; color:#666; background:white; border-radius:4px; margin-bottom:15px;">Nenhum checklist encontrado nesta data.</div>' : "";

    lista.forEach(sessao => {
        let itens = sessao.itensRespondidos || [];
        let ok = itens.filter(i => i.resposta === "OK").length;
        let nc = itens.filter(i => i.resposta === "NAO_CONFORME" || i.resposta === "NÃO CONFORME").length;
        
        html += `
            <div onclick="verDetalhesChecklist('${sessao.idSessao}')" style="background:white; border-left:5px solid #6f42c1; padding:12px; margin-bottom:10px; border-radius:6px; cursor:pointer; text-align:left; border:1px solid #dee2e6; border-left-width:5px;">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <strong style="color:#333; font-size:14px;">${sessao.setor}</strong>
                    <small style="color:#6c757d;">🕒 ${sessao.hora || "--:--"}</small>
                </div>
                <small style="color:#495057; display:block; margin-top:2px;">👤 Responsável: ${sessao.usuario}</small>
                <hr style="margin:8px 0; border:0; border-top:1px solid #f1f1f1;">
                <div style="font-size:12px; font-weight:bold;">
                    🟢 OK: ${ok} &nbsp;&nbsp; 🔴 Não Conforme: ${nc} &nbsp;&nbsp; 📋 Total: ${itens.length}
                </div>
            </div>
        `;
    });

    let d = dataSelecionada.split("/");
    let inputDateVal = `${d[2]}-${d[1]}-${d[0]}`;

    container.innerHTML = `
        <div class="topo"><h1>📋 HISTÓRICO DE CHECKLISTS</h1></div>
        <div class="login" style="max-width: 100%; max-height: 75vh; overflow-y: auto; padding: 10px;">
            <div style="background:#e2e3e5; padding:10px; margin-bottom:15px; border-radius:4px; text-align:center;">
                <label style="font-size:12px; font-weight:bold; color:#495057; display:block; margin-bottom:5px;">📅 SELECIONE A DATA DE CONSULTA:</label>
                <input type="date" value="${inputDateVal}" onchange="abrirHistoricoChecklistsGerente(this.value)" style="padding:6px; font-size:14px; width:80%; max-width:200px; border:1px solid #ccc; border-radius:4px;">
            </div>
            <button onclick="exportarParaExcel('Historico_Checklists','gondola_historico_checklists')" style="width:100%; background:#6c757d; color:white; padding:8px; margin-bottom:15px; font-weight:bold;">📥 Exportar Excel</button>
            ${html}
            <button onclick="typeof usuarioAtual !== 'undefined' && usuarioAtual === 'Administrador' ? abrirPainelAdmin() : voltarMenuPrincipal()" style="background:#495057; color:white; width:100%; margin-top:15px;">⬅️ Voltar</button>
        </div>
    `;
}

// ==========================================
// 19. DETALHES DO CHECKLIST - NUVEM / GOOGLE SHEETS
// ==========================================
window.verDetalhesChecklist = async function(idSessao) {
    let container = document.querySelector(".container");
    if (!container) return;

    container.innerHTML = `
        <div class="topo"><h1>📋 DETALHES DO CHECKLIST</h1></div>
        <div class="login" style="max-width: 100%; text-align: center; padding: 20px;">
            <p style="color:#6c757d;">⏳ Buscando dados do checklist...</p>
        </div>
    `;

    let historico = [];
    try {
        if (typeof URL_API_GAS !== 'undefined' && URL_API_GAS) {
            let resposta = await fetch(`${URL_API_GAS}?acao=listarHistoricoChecklists`);
            let resultado = await resposta.json();
            if (resultado && resultado.historico) {
                historico = resultado.historico;
            }
        } else {
            throw new Error("URL_API_GAS não configurada");
        }
    } catch (e) {
        historico = JSON.parse(localStorage.getItem("gondola_historico_checklists")) || [];
    }

    let sessao = historico.find(s => String(s.idSessao) === String(idSessao));
    if (!sessao) {
        alert("Checklist não encontrado.");
        abrirHistoricoChecklistsGerente();
        return;
    }

    let itensHtml = (sessao.itensRespondidos || []).map((item, index) => {
        let isOk = item.resposta === "OK";
        let statusBadge = isOk 
            ? `<span style="color:#28a745; font-weight:bold;">🟢 OK</span>` 
            : `<span style="color:#dc3545; font-weight:bold;">🔴 NÃO CONFORME</span>`;

        return `
            <div style="padding:10px; border-bottom:1px solid #eee; text-align:left; font-size:13px;">
                <p style="margin:0 0 5px 0;"><strong>${index + 1}. ${item.perguntaTexto}</strong></p>
                <div style="background:#f8f9fa; padding:6px; border-radius:4px; font-size:12px;">
                    Status: ${statusBadge}
                    ${item.observacao ? `<br><span style="color:#555;">💬 <strong>Obs:</strong> ${item.observacao}</span>` : ""}
                </div>
            </div>
        `;
    }).join("");

    container.innerHTML = `
        <div class="topo"><h1>${sessao.setor}</h1></div>
        <div class="login" style="max-width: 100%; max-height: 75vh; overflow-y: auto; padding: 15px;">
            <div style="background:#e9ecef; padding:8px; border-radius:4px; font-size:12px; margin-bottom:15px; text-align:left; color:#495057;">
                👤 <strong>Responsável:</strong> ${sessao.usuario}<br>
                📅 <strong>Data:</strong> ${sessao.data} às ${sessao.hora || "--:--"}
            </div>
            ${itensHtml}
            <button onclick="abrirHistoricoChecklistsGerente()" style="background:#6c757d; color:white; width:100%; margin-top:20px;">⬅️ Voltar ao Histórico</button>
        </div>
    `;
};

// ==========================================================
// FUNÇÃO ACIONADA PELO BOTÃO DA TELA DE GESTÃO (CICLO EVOLUTIVO DE 6 DIAS) - NUVEM / GOOGLE SHEETS
// ==========================================================
let indiceMissaoAtual = 0;
let perguntasMissao = [];

function abrirMenuChecklistsGerente() {
    // Controle do Ciclo de Dias (1 a 6)
    let diaDoCiclo = parseInt(localStorage.getItem("gondola_ciclo_checklist_dia")) || 1;

    // ==========================================
    // REGRA DO 6º DIA: DIA DA GESTÃO OPERACIONAL
    // ==========================================
    if (diaDoCiclo >= 6) {
        renderizarDiaDaGestao();
        return;
    }

    // Carrega a base da planilha para os dias com perguntas (Dias 1 a 5)
    let basePlanilha = JSON.parse(localStorage.getItem("gondola_checklist_config")) || [];
    let perguntas = basePlanilha.filter(p => p.diaria === true);

    if (perguntas.length === 0) {
        alert("⚠️ Nenhuma pergunta diária encontrada! Importe a planilha primeiro.");
        return;
    }

    // ==========================================
    // REGRA DO 5º DIA: CHECKLIST GLOBAL (TODAS)
    // ==========================================
    if (diaDoCiclo === 5) {
        alert("📢 DIA DO CHECKLIST GLOBAL: Hoje a auditoria será COMPLETA (todas as perguntas da planilha) para preparar o diagnóstico da loja!");
        perguntas.sort(() => Math.random() - 0.5);
    } 
    // ==========================================
    // REGRA DO 1º AO 4º DIA: ROTINA AMOSTRAL (15)
    // ==========================================
    else {
        perguntas.sort(() => Math.random() - 0.5);
        if (perguntas.length > 15) {
            perguntas = perguntas.slice(0, 15);
        }
    }

    // Organiza por setor para otimizar o deslocamento na área de vendas
    perguntas.sort((a, b) => a.setor.localeCompare(b.setor));

    perguntasMissao = perguntas;
    indiceMissaoAtual = 0;

    renderizarPerguntaDoChecklist();
}

// --- TELA EXCLUSIVA DO 6º DIA (APÓS O GLOBAL) ---
function renderizarDiaDaGestao() {
    let container = document.querySelector(".container");
    if (!container) return;

    container.innerHTML = `
        <div class="topo" style="background:#4b13b3;">
            <h1>📊 DIA DA GESTÃO OPERACIONAL</h1>
            <p>Foco Estratégico e Auditoria de Indicadores</p>
        </div>

        <div style="padding: 15px; text-align: center;">
            <div style="background: #f3f0ff; border-left: 5px solid #6f42c1; padding: 15px; border-radius: 6px; text-align: left; margin-bottom: 20px;">
                <h3 style="color: #4b13b3; margin-top: 0; font-size: 16px;">🎯 Diagnóstico Estratégico da Loja:</h3>
                <p style="font-size: 14px; color: #333; line-height: 1.5; margin: 5px 0;">
                    Hoje é o <strong>Dia da Gestão</strong>. Com base no Checklist Global realizado ontem, utilize este turno para:
                </p>
                <ul style="font-size: 13px; color: #444; padding-left: 20px; line-height: 1.6;">
                    <li>Analise o comportamento da loja/missões e veja quais as pendências acumuladas.</li>
                    <li>Mapeie os gargalos operacionais e defina os planos de ação com os encarregados.</li>
                    <li>Monitore os relatórios de ruptura para ajustar a reposição.</li>
                </ul>
            </div>

            <button onclick="salvarDiaDaGestaoNoHist()" style="width:100%; padding:16px; background:#6f42c1; color:white; border:none; border-radius:6px; font-size:16px; font-weight:bold; cursor:pointer;">
                ✅ Concluir Análise de Gestão
            </button>

            <button onclick="location.reload()" style="width:100%; padding:12px; background:#6c757d; color:white; border:none; border-radius:6px; font-size:14px; margin-top: 15px; cursor:pointer;">
                ↩ Voltar ao Menu
            </button>
        </div>
    `;
}

function renderizarPerguntaDoChecklist() {
    let container = document.querySelector(".container");
    if (!container) return;

    let p = perguntasMissao[indiceMissaoAtual];
    let diaDoCiclo = parseInt(localStorage.getItem("gondola_ciclo_checklist_dia")) || 1;
    
    // Identificação visual na barra superior
    let tituloTopo = diaDoCiclo === 5 ? "📢 CHECKLIST GLOBAL" : "📋 CHECKLIST OPERACIONAL";
    let subTitulo = diaDoCiclo === 5 ? "Auditoria Integral de Preparação" : `Auditoria Amostral - Dia ${diaDoCiclo} de 4`;
    let corTopo = diaDoCiclo === 5 ? "#e67e22" : "#6f42c1"; // Laranja para destacar o dia Global

    container.innerHTML = `
        <div class="topo" style="background:${corTopo};">
            <h1>${tituloTopo}</h1>
            <p>${subTitulo}</p>
        </div>

        <div style="text-align:center;padding:10px;">
            <p style="font-size:11px;color:#666;margin-bottom:5px;">
                Item ${indiceMissaoAtual + 1} de ${perguntasMissao.length}
            </p>
            <p style="font-size:13px;font-weight:bold;color:${corTopo};margin-bottom:20px;text-transform:uppercase;">
                📍 Setor: ${p.setor}
            </p>
            <div style="font-size:17px;font-weight:bold;margin-bottom:25px;min-height:60px;display:flex;align-items:center;justify-content:center;line-height:1.4;color:#333;">
                "${p.pergunta}"
            </div>

            <button onclick="salvarRespostaPasso('SIM')" style="width:100%;padding:16px;background:#28a745;color:white;border:none;border-radius:6px;margin-bottom:12px;font-size:16px;font-weight:bold;cursor:pointer;">
                🟢 SIM (CONFORME)
            </button>
            <button onclick="salvarRespostaPasso('NÃO')" style="width:100%;padding:16px;background:#dc3545;color:white;border:none;border-radius:6px;margin-bottom:12px;font-size:16px;font-weight:bold;cursor:pointer;">
                🔴 NÃO CONFORME
            </button>
            <button onclick="location.reload()" style="width:100%;padding:12px;background:#6c757d;color:white;border:none;border-radius:6px;font-size:14px;margin-top:15px;cursor:pointer;">
                ↩ Cancelar e Sair
            </button>
        </div>
    `;
}

async function salvarRespostaPasso(resposta) {
    let perguntaAtual = perguntasMissao[indiceMissaoAtual];
    let respostas = JSON.parse(localStorage.getItem("gondola_respostas_checklist_atual")) || [];

    respostas.push({
        perguntaTexto: perguntaAtual.pergunta,
        setor: perguntaAtual.setor,
        resposta: resposta === "SIM" ? "OK" : "NAO_CONFORME",
        observacao: ""
    });

    localStorage.setItem("gondola_respostas_checklist_atual", JSON.stringify(respostas));
    indiceMissaoAtual++;

    if (indiceMissaoAtual < perguntasMissao.length) {
        renderizarPerguntaDoChecklist();
        return;
    }

    // FINALIZAÇÃO DE RESPOSTAS (DIAS 1 A 5)
    let historico = JSON.parse(localStorage.getItem("gondola_historico_checklists")) || [];
    let itensRespondidos = JSON.parse(localStorage.getItem("gondola_respostas_checklist_atual")) || [];
    let conformes = itensRespondidos.filter(i => i.resposta === "OK").length;
    let percentual = Math.round((conformes / itensRespondidos.length) * 100);

    let diaDoCiclo = parseInt(localStorage.getItem("gondola_ciclo_checklist_dia")) || 1;
    let sessaoId = Date.now();

    let novoChecklist = {
        idSessao: sessaoId,
        setor: "Checklist Operacional",
        tipoMissao: diaDoCiclo === 5 ? "GLOBAL" : "ROTINA", // Separação para os gráficos
        usuario: (typeof usuarioAtual !== "undefined" && usuarioAtual) ? usuarioAtual : "Administrador",
        data: new Date().toLocaleDateString("pt-BR"),
        hora: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        nota: percentual,
        totalPerguntas: itensRespondidos.length,
        conformes: conformes,
        itensRespondidos: itensRespondidos
    };

    historico.push(novoChecklist);
    localStorage.setItem("gondola_historico_checklists", JSON.stringify(historico));
    localStorage.removeItem("gondola_respostas_checklist_atual");

    // Envio para a nuvem (Google Sheets via Apps Script)
    try {
        if (typeof URL_API_GAS !== 'undefined' && URL_API_GAS) {
            await fetch(URL_API_GAS, {
                method: "POST",
                mode: "no-cors",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    acao: "salvarChecklist",
                    ...novoChecklist
                })
            });
        }
    } catch (e) {
        console.warn("Erro ao sincronizar checklist operacional com a nuvem, salvo apenas localmente.", e);
    }

    // Avança para o próximo dia (no caso, vai para o Dia 6 - Dia da Gestão)
    localStorage.setItem("gondola_ciclo_checklist_dia", diaDoCiclo + 1);

    alert(`✅ Checklist gravado com sucesso!\n\nÍndice de Conformidade: ${percentual}%`);
    abrirPainelAdmin();
}

// --- CONCLUSÃO AUTOMÁTICA DO DIA DA GESTÃO ---
async function salvarDiaDaGestaoNoHist() {
    let historico = JSON.parse(localStorage.getItem("gondola_historico_checklists")) || [];
    let sessaoId = Date.now();

    let analiseGestao = {
        idSessao: sessaoId,
        setor: "Checklist Operacional",
        tipoMissao: "DIA_GESTAO", // Tag estratégica
        usuario: (typeof usuarioAtual !== "undefined" && usuarioAtual) ? usuarioAtual : "Administrador",
        data: new Date().toLocaleDateString("pt-BR"),
        hora: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        nota: 100, // Pontuação fixa pela execução da análise estratégica
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

    // Envio para a nuvem (Google Sheets via Apps Script)
    try {
        if (typeof URL_API_GAS !== 'undefined' && URL_API_GAS) {
            await fetch(URL_API_GAS, {
                method: "POST",
                mode: "no-cors",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    acao: "salvarChecklist",
                    ...analiseGestao
                })
            });
        }
    } catch (e) {
        console.warn("Erro ao sincronizar dia da gestão com a nuvem, salvo apenas localmente.", e);
    }

    // Finalizou o 6º dia, reseta o ciclo completo de volta para o Dia 1
    localStorage.setItem("gondola_ciclo_checklist_dia", 1);

    alert("📊 Relatório de Análise da Gestão arquivado com sucesso! Ciclo reiniciado.");
    abrirPainelAdmin();
}
// ==========================================================
// SERVIÇO: COLETOR DE ETIQUETAS AVULSO + NUVEM (GOOGLE SHEETS)
// ==========================================================

let scannerColetorAtivo = null;
let produtoColetorSelecionado = null;


function abrirColetorEtiquetas() {

    let container = document.querySelector(".container");
    if (!container) return;

    container.innerHTML = `
        <div class="topo" style="background:#f0ad4e;">
            <h1>🏷️ COLETOR DE ETIQUETAS</h1>
            <p>Busca Direta na Base Global do Supermercado</p>
        </div>


        <div style="padding:20px;">

            <div id="reader_coletor" style="width:100%; border-radius:8px; overflow:hidden; margin-bottom:15px;"></div>


            <div style="display:flex; gap:8px; margin-bottom:15px;">

                <button onclick="ligarCameraColetor()" 
                style="flex:1;padding:12px;background:#007bff;color:white;border:0;border-radius:6px;font-weight:bold;">
                📷 Abrir Câmera
                </button>


                <button onclick="fecharCameraColetor()" 
                style="flex:1;padding:12px;background:#dc3545;color:white;border:0;border-radius:6px;font-weight:bold;">
                🛑 Fechar
                </button>

            </div>


            <label style="font-weight:bold;">
            Código de Barras ou Nome:
            </label>

            <input id="input_coletor_etiqueta"
            placeholder="Bipe ou digite o item..."
            style="width:100%;padding:15px;margin:8px 0 15px;font-size:16px;box-sizing:border-box;">



            <button onclick="buscarProdutoNaBaseGlobal()"
            style="width:100%;padding:16px;background:#28a745;color:white;border:0;border-radius:6px;font-weight:bold;">
            🔍 VERIFICAR PRODUTO
            </button>


            <div id="resultado_busca_coletor" style="margin-top:20px;"></div>



            <button onclick="fecharCameraColetor(); voltarMenuPrincipal();"
            style="width:100%;padding:12px;background:#6c757d;color:white;border:0;border-radius:6px;margin-top:20px;">
            ↩ Voltar
            </button>

        </div>
    `;


    setTimeout(()=>{
        document.getElementById("input_coletor_etiqueta")?.focus();
    },100);
}





function ligarCameraColetor(){

    fecharCameraColetor();

    scannerColetorAtivo = new Html5QrcodeScanner(
        "reader_coletor",
        {
            fps:10,
            qrbox:{width:250,height:150}
        }
    );


    scannerColetorAtivo.render((codigo)=>{

        let input=document.getElementById("input_coletor_etiqueta");

        if(input){
            input.value=codigo;
            fecharCameraColetor();
            buscarProdutoNaBaseGlobal();
        }

    },()=>{});

}





function fecharCameraColetor(){

    if(scannerColetorAtivo){

        try{
            scannerColetorAtivo.clear();
        }catch(e){}

        scannerColetorAtivo=null;
    }


    let div=document.getElementById("reader_coletor");

    if(div){
        div.innerHTML="";
    }
}





function buscarProdutoNaBaseGlobal(){

    let input=document.getElementById("input_coletor_etiqueta");
    let resultado=document.getElementById("resultado_busca_coletor");


    if(!input || !resultado) return;


    let termo=input.value.trim().toUpperCase();


    if(!termo){
        alert("Digite ou bipe um produto!");
        return;
    }



    let baseGlobal =
    JSON.parse(localStorage.getItem("base_global")) ||
    JSON.parse(localStorage.getItem("gondola_base_global")) ||
    JSON.parse(localStorage.getItem("gondola_produtos_config")) ||
    [];



    let encontrado=null;



    for(let item of baseGlobal){

        if(!item) continue;


        let codigo=
        (item.codigo ||
        item.cod_barra ||
        item.barcode ||
        item.codBarras ||
        "")
        .toString()
        .trim();



        let nome=
        (item.produto ||
        item.descricao ||
        item.pergunta ||
        item.nome ||
        "")
        .toUpperCase();



        if(codigo===termo || (termo.length>3 && nome.includes(termo))){

            encontrado=item;
            break;
        }

    }




    if(encontrado){


        let nome =
        encontrado.produto ||
        encontrado.descricao ||
        encontrado.pergunta ||
        encontrado.nome ||
        termo;



        produtoColetorSelecionado={

            codigo:
            encontrado.codigo || termo,

            nome:nome,

            setor:
            encontrado.setor || "Geral"
        };



        resultado.innerHTML=`

        <div style="background:#d4edda;padding:15px;border-radius:6px;">
        
        <strong>✅ PRODUTO ENCONTRADO</strong>

        <p style="font-weight:bold;font-size:16px;">
        ${nome}
        </p>

        <small>
        📍 Setor: ${produtoColetorSelecionado.setor}
        </small>

        </div>


        <button onclick="confirmarEGravarEtiquetaPendente()"
        style="width:100%;padding:16px;background:#28a745;color:white;border:0;border-radius:6px;margin-top:15px;font-weight:bold;">
        💾 Confirmar e Gerar Etiqueta
        </button>

        `;


    }else{


        produtoColetorSelecionado={

            codigo:termo,
            nome:termo,
            setor:"Coleta Avulsa"

        };


        resultado.innerHTML=`

        <div style="background:#fff3cd;padding:15px;border-radius:6px;">
        ⚠️ Produto não localizado.
        <br><br>
        Será salvo como:
        <b>${termo}</b>
        </div>


        <button onclick="confirmarEGravarEtiquetaPendente()"
        style="width:100%;padding:16px;background:#ffc107;border:0;border-radius:6px;margin-top:15px;font-weight:bold;">
        ⚠️ Confirmar Etiqueta
        </button>

        `;

    }

}





async function confirmarEGravarEtiquetaPendente(){


    if(!produtoColetorSelecionado){
        alert("Nenhum produto selecionado!");
        return;
    }


    let lista =
    JSON.parse(localStorage.getItem("etiquetas_pendentes")) || [];


    let nome =
    produtoColetorSelecionado.nome
    .toString()
    .trim()
    .toUpperCase();



    let novaEtiqueta={

        id:Date.now()+Math.random(),

        codigo:
        produtoColetorSelecionado.codigo,

        produto:nome,

        descricao:nome,

        pergunta:nome,

        setor:
        produtoColetorSelecionado.setor,

        data:
        new Date().toLocaleDateString("pt-BR"),

        precificado:false,

        status:"PENDENTE"

    };



    lista.push(novaEtiqueta);



    localStorage.setItem(
        "etiquetas_pendentes",
        JSON.stringify(lista)
    );

    // Sincronização em nuvem (Google Sheets)
    try {
        if (typeof URL_API_GAS !== 'undefined' && URL_API_GAS) {
            await fetch(URL_API_GAS, {
                method: "POST",
                mode: "no-cors",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    acao: "salvarEtiquetaPendente",
                    ...novaEtiqueta
                })
            });
        }
    } catch (e) {
        console.warn("Erro ao sincronizar etiqueta com a nuvem, salva localmente.", e);
    }



    alert(
        "✅ Etiqueta salva:\n\n" + nome
    );



    // Mantém na tela do coletor
    produtoColetorSelecionado = null;



    let campo = document.getElementById("input_coletor_etiqueta");

    if(campo){

        campo.value = "";

        campo.focus();

    }



    let resultado =
    document.getElementById("resultado_busca_coletor");


    if(resultado){

        resultado.innerHTML = "";

    }


}

// ==========================================================
// IMPORTAÇÃO DE RUAS E ROTAS (CSV LOCAL + NUVEM)
// ==========================================================
function processarArquivoCSVRotas(elementoInput) {
    let arquivo = elementoInput.files[0];
    if (!arquivo) return;

    let leitor = new FileReader();
    leitor.onload = async function(e) {
        try {
            let texto = e.target.result;
            let linhas = texto.split("\n");
            let resultado = [];

            for (let i = 1; i < linhas.length; i++) {
                let linhaLimpa = linhas[i].trim();
                if (!linhaLimpa) continue;

                let colunas = linhaLimpa.split(";");
                let nomeRua = colunas[2] ? colunas[2].trim().toUpperCase() : "";
                
                if (nomeRua === "" || nomeRua === "NOME") continue;

                resultado.push({
                    CIDADE: colunas[0] ? colunas[0].trim().toUpperCase() : "",
                    BAIRRO: colunas[1] ? colunas[1].trim().toUpperCase() : "",
                    NOME:   nomeRua,
                    ROTA:   colunas[3] ? colunas[3].trim().replace("\r", "") : "1"
                });
            }

            localStorage.setItem("base_ruas_entrega", JSON.stringify(resultado));

            // Sincroniza a base de ruas com a nuvem para manter todos os caixas atualizados
            try {
                if (typeof URL_API_GAS !== 'undefined' && URL_API_GAS) {
                    await fetch(URL_API_GAS, {
                        method: "POST",
                        mode: "no-cors",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            acao: "sincronizarBaseRuas",
                            ruas: resultado
                        })
                    });
                }
            } catch (netErr) {
                console.warn("Aviso: Base de ruas gravada localmente, falha na sincronização via nuvem.", netErr);
            }

            alert("✅ Planilha base integrada e sincronizada! " + resultado.length + " ruas prontas.");
            
            if (typeof abrirPainelAdmin === "function") abrirPainelAdmin();

        } catch (err) {
            console.error(err);
            alert("❌ Erro ao ler a planilha.");
        }
    };
    leitor.readAsText(arquivo, "UTF-8");
}

// --- Variáveis de Controle do Fluxo em Cascata ---
let entregaEmEdicao = {
    cliente: "", cidade: "", bairro: "", rua: "", numero: "", apartamento: "Não", aptoDetalhe: "", caixas: 1, gelados: "Não"
};

// --- FUNÇÃO PARA CARREGAR RUAS DA NUVEM SE NECESSÁRIO ---
async function carregarBaseRuasDaNuvem() {
    try {
        if (typeof URL_API_GAS !== 'undefined' && URL_API_GAS) {
            let resposta = await fetch(`${URL_API_GAS}?acao=obterBaseRuas`);
            let dadosNuvem = await resposta.json();
            if (dadosNuvem && Array.isArray(dadosNuvem) && dadosNuvem.length > 0) {
                localStorage.setItem("base_ruas_entrega", JSON.stringify(dadosNuvem));
            }
        }
    } catch (e) {
        console.warn("Usando base de ruas local (offline ou sem retorno da nuvem).", e);
    }
}

// --- 2. TELA PRINCIPAL DO FISCAL DE CAIXA (LANÇAMENTO) ---
async function abrirAbaLancamentoEntrega() {
    let container = document.querySelector(".container");
    if (!container) return;

    // Atualiza base de ruas da nuvem em segundo plano ao abrir a tela
    await carregarBaseRuasDaNuvem();

    entregaEmEdicao = { cliente: "", cidade: "", bairro: "", rua: "", numero: "", apartamento: "Não", aptoDetalhe: "", caixas: 1, gelados: "Não" };

    container.innerHTML = `
        <div class="topo" style="background:#0275d8;">
            <h1>📦 LANÇAMENTO DE ENTREGAS</h1>
            <p>Fluxo Blindado contra Erros de Operação</p>
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
}

// --- 3. INTELIGÊNCIA DO CADASTRO AUTOMÁTICO ---
function buscarClienteCadastro(nomeDigitado) {
    let termo = nomeDigitado.trim().toUpperCase();
    let divSugestoes = document.getElementById("sugestoes_clientes");
    if (!divSugestoes) return;

    if (termo.length < 2) {
        divSugestoes.innerHTML = "";
        return;
    }

    let cadastros = JSON.parse(localStorage.getItem("cadastro_clientes_entrega")) || [];
    let filtrados = cadastros.filter(c => c.nome.includes(termo));

    if (filtrados.length === 0) {
        divSugestoes.innerHTML = `<div style="padding:10px; color:#888; font-size:13px;">🆕 Cliente novo. Prossiga com os botões abaixo.</div>`;
        entregaEmEdicao.cliente = termo;
        if(document.getElementById("painel_cascata_botoes").innerHTML === "") {
            renderizarBotoesCidade();
        }
        return;
    }

    divSugestoes.innerHTML = filtrados.map(c => `
        <div onclick="aplicarClienteCadastrado('${c.nome}')" 
             style="padding:12px; border-bottom:1px solid #eee; cursor:pointer; background:#fffbf0; font-weight:bold; color:#333;">
             👤 ${c.nome} <br><span style="font-size:11px; color:#777;">📍 ${c.rua}, Nº ${c.numero} - ${c.bairro}</span>
        </div>
    `).join("");
}

function aplicarClienteCadastrado(nomeCliente) {
    let cadastros = JSON.parse(localStorage.getItem("cadastro_clientes_entrega")) || [];
    let c = cadastros.find(item => item.nome === nomeCliente);

    if (c) {
        document.getElementById("ent_nome_cliente").value = c.nome;
        document.getElementById("sugestoes_clientes").innerHTML = "";

        entregaEmEdicao = {
            cliente: c.nome, cidade: c.cidade, bairro: c.bairro, rua: c.rua,
            numero: c.numero, apartamento: c.apartamento, aptoDetalhe: c.apartamentoDetalhe,
            caixas: 1, gelados: "Não"
        };

        let painel = document.getElementById("painel_cascata_botoes");
        painel.innerHTML = `
            <div style="background:#d1ecf1; color:#0c5460; padding:12px; border-radius:6px; margin-bottom:10px; border-left:5px solid #17a2b8;">
                <strong>📍 Endereço Recorrente Carregado:</strong><br>
                ${c.rua}, ${c.numero} ${c.apartamento === 'Sim' ? '- ' + c.apartamentoDetalhe : ''}<br>
                ${c.bairro} (${c.cidade})
                <button onclick="renderizarBotoesCidade()" style="margin-top:8px; display:block; padding:4px 8px; background:#17a2b8; color:white; border:none; border-radius:4px; font-size:11px; cursor:pointer;">🔄 Alterar Endereço</button>
            </div>
        `;

        document.getElementById("formulario_final_entrega").style.display = "block";
        document.getElementById("ent_numero").value = c.numero;
        document.getElementById("ent_apto").value = c.apartamento;
        toggleCampoApartamento(c.apartamento);
        document.getElementById("ent_apto_detalhe").value = c.apartamentoDetalhe;
    }
}

// --- 4. RENDERIZADORES DA CASCATA DE BOTÕES ---
function renderizarBotoesCidade() {
    let baseRuas = JSON.parse(localStorage.getItem("base_ruas_entrega")) || [];
    let cidades = [...new Set(baseRuas.map(r => r.CIDADE))].sort();

    let painel = document.getElementById("painel_cascata_botoes");
    document.getElementById("formulario_final_entrega").style.display = "none";

    painel.innerHTML = `
        <label style="font-weight:bold; font-size:13px; color:#555; display:block; margin-bottom:5px;">1. Selecione a Cidade:</label>
        <div style="display:flex; gap:8px; flex-wrap:wrap;">
            ${cidades.map(cid => `<button onclick="selecionarCidade('${cid}')" style="padding:12px; background:#fff; border:2px solid #0275d8; color:#0275d8; border-radius:6px; font-weight:bold; cursor:pointer;">🏙️ ${cid}</button>`).join("")}
        </div>
    `;
}

function selecionarCidade(nomeCidade) {
    entregaEmEdicao.cidade = nomeCidade;
    
    let baseRuas = JSON.parse(localStorage.getItem("base_ruas_entrega")) || [];
    let bairros = [...new Set(baseRuas.filter(r => r.CIDADE === nomeCidade).map(r => r.BAIRRO))].sort();

    let painel = document.getElementById("painel_cascata_botoes");
    painel.innerHTML = `
        <div style="color:#28a745; font-size:13px; margin-bottom:8px;">✅ Cidade: <b>${nomeCidade}</b></div>
        <label style="font-weight:bold; font-size:13px; color:#555; display:block; margin-bottom:5px;">2. Selecione o Bairro:</label>
        <div style="display:flex; gap:8px; flex-wrap:wrap;">
            ${bairros.map(bai => `<button onclick="selecionarBairro('${bai}')" style="padding:10px 14px; background:#fff; border:2px solid #f0ad4e; color:#f0ad4e; border-radius:6px; font-weight:bold; cursor:pointer;">🏡 ${bai}</button>`).join("")}
        </div>
    `;
}

function selecionarBairro(nomeBairro) {
    entregaEmEdicao.bairro = nomeBairro;

    let baseRuas = JSON.parse(localStorage.getItem("base_ruas_entrega")) || [];
    let ruas = baseRuas.filter(r => r.CIDADE === entregaEmEdicao.cidade && r.BAIRRO === nomeBairro).map(r => r.NOME).sort();

    let painel = document.getElementById("painel_cascata_botoes");
    painel.innerHTML = `
        <div style="color:#28a745; font-size:13px; margin-bottom:4px;">✅ Cidade: <b>${entregaEmEdicao.cidade}</b></div>
        <div style="color:#28a745; font-size:13px; margin-bottom:8px;">✅ Bairro: <b>${nomeBairro}</b></div>
        <label style="font-weight:bold; font-size:13px; color:#555; display:block; margin-bottom:5px;">3. Selecione a Rua / Avenida:</label>
        <div style="display:flex; flex-direction:column; gap:6px;">
            ${ruas.map(rua => `<button onclick="selecionarRua('${rua.replace(/'/g, "\\'")}')" style="padding:12px; background:#fff; border:1px solid #ddd; text-align:left; border-radius:6px; font-weight:bold; color:#333; cursor:pointer; border-left:4px solid #6c757d;">🛣️ ${rua}</button>`).join("")}
        </div>
    `;
}

function selecionarRua(nomeRua) {
    entregaEmEdicao.rua = nomeRua;

    let baseRuas = JSON.parse(localStorage.getItem("base_ruas_entrega")) || [];
    let ruaEncontrada = baseRuas.find(r => 
        r.CIDADE === entregaEmEdicao.cidade && 
        r.BAIRRO === entregaEmEdicao.bairro && 
        r.NOME === nomeRua
    );
    
    entregaEmEdicao.rota = ruaEncontrada ? ruaEncontrada.ROTA : "1";

    let painel = document.getElementById("painel_cascata_botoes");
    if (painel) {
        painel.innerHTML = `
            <div style="color:#28a745; font-size:13px; margin-bottom:2px;">✅ Cidade: <b>${entregaEmEdicao.cidade}</b></div>
            <div style="color:#28a745; font-size:13px; margin-bottom:2px;">✅ Bairro: <b>${entregaEmEdicao.bairro}</b></div>
            <div style="color:#28a745; font-size:13px; margin-bottom:8px;">✅ Rua: <b>${nomeRua}</b> (Rota: ${entregaEmEdicao.rota})</div>
        `;
    }

    let elCidade = document.getElementById("lbl_cidade") || document.querySelector("[id*='cidade']") || document.querySelector("[id*='Cidade']");
    let elBairro = document.getElementById("lbl_bairro") || document.querySelector("[id*='bairro']") || document.querySelector("[id*='Bairro']");
    let elRua    = document.getElementById("lbl_rua")    || document.querySelector("[id*='rua']")    || document.querySelector("[id*='Rua']");

    if (elCidade) elCidade.innerText = "Cidade: " + entregaEmEdicao.cidade;
    if (elBairro) elBairro.innerText = "Bairro: " + entregaEmEdicao.bairro;
    if (elRua)    elRua.innerText    = "Rua: " + nomeRua + " (Rota: " + entregaEmEdicao.rota + ")";

    document.getElementById("formulario_final_entrega").style.display = "block";
    
    let campoNumero = document.getElementById("ent_numero") || document.getElementById("numero_residencia") || document.querySelector("input[placeholder*='Número']");
    if (campoNumero) campoNumero.focus();
}

function toggleCampoApartamento(valor) {
    document.getElementById("bloco_detalhe_apto").style.display = (valor === "Sim") ? "block" : "none";
}

// --- 5. GRAVAÇÃO REAL E SINCRONIZAÇÃO EM NUVEM ---
async function salvarNovaEntrega() {
    let nomeCliente = document.getElementById("ent_nome_cliente").value.trim().toUpperCase();
    let num = document.getElementById("ent_numero").value.trim().toUpperCase();
    let apto = document.getElementById("ent_apto").value;
    let aptoDet = document.getElementById("ent_apto_detalhe").value.trim().toUpperCase();
    let cx = parseInt(document.getElementById("ent_caixas").value) || 1;
    let gel = document.getElementById("ent_gelados").value;

    if (!nomeCliente) { alert("⚠️ Digite o nome do cliente!"); return; }
    if (!num) { alert("⚠️ Informe o número ou digite S/N!"); return; }
    if (apto === "Sim" && !aptoDet) { alert("⚠️ Digite os dados do apartamento!"); return; }

    let entregasAtuais = JSON.parse(localStorage.getItem("registro_entregas")) || [];
    
    let novaEntrega = {
        idEntrega: Date.now(),
        cliente: nomeCliente,
        cidade: entregaEmEdicao.cidade || "MANHUMIRIM",
        bairro: entregaEmEdicao.bairro,
        rua: entregaEmEdicao.rua,
        numero: num,
        apartamento: apto,
        apartamentoDetalhe: aptoDet,
        caixas: cx,
        gelados: gel,
        status: "Pendente",
        dataLancamento: new Date().toLocaleDateString("pt-BR"),
        horaLancamento: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        horaFinalizacao: null,
        tempoDecorridoMinutos: null,
        dentroDoPrazo: true,
        rota: entregaEmEdicao.rota || "1"
    };

    entregasAtuais.push(novaEntrega);
    localStorage.setItem("registro_entregas", JSON.stringify(entregasAtuais));

    // Salva na nuvem (Google Sheets)
    try {
        if (typeof URL_API_GAS !== 'undefined' && URL_API_GAS) {
            await fetch(URL_API_GAS, {
                method: "POST",
                mode: "no-cors",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    acao: "salvarEntrega",
                    ...novaEntrega
                })
            });
        }
    } catch (e) {
        console.warn("Entrega salva localmente, falha ao sincronizar com a nuvem.", e);
    }

    let cadastros = JSON.parse(localStorage.getItem("cadastro_clientes_entrega")) || [];
    if (!cadastros.some(item => item.nome === nomeCliente)) {
        cadastros.push({
            nome: nomeCliente, cidade: novaEntrega.cidade, bairro: novaEntrega.bairro,
            rua: novaEntrega.rua, numero: num, apartamento: apto, apartamentoDetalhe: aptoDet
        });
        localStorage.setItem("cadastro_clientes_entrega", JSON.stringify(cadastros));
    }

    alert(`✅ Sucesso!\nTicket Gerado para ${nomeCliente}.\nMeta de Entrega: até às ${calcularHoraLimite(novaEntrega.horaLancamento)}`);
    abrirAbaLancamentoEntrega();
}

function calcularHoraLimite(horaString) {
    let partes = horaString.split(":");
    let h = (parseInt(partes[0]) + 4) % 24;
    return `${h.toString().padStart(2, '0')}:${partes[1]}`;
}

// --- ABA DO MOTORISTA (COM SINCRONIZAÇÃO EM NUVEM) ---
async function abrirAbaMotoristaEntrega(rotaParaManterAberta = null) {
    let container = document.querySelector(".container");
    if (!container) return;

    // Tenta atualizar as entregas da nuvem antes de renderizar
    try {
        if (typeof URL_API_GAS !== 'undefined' && URL_API_GAS) {
            let resposta = await fetch(`${URL_API_GAS}?acao=obterEntregas`);
            let dadosNuvem = await resposta.json();
            if (dadosNuvem && Array.isArray(dadosNuvem) && dadosNuvem.length > 0) {
                localStorage.setItem("registro_entregas", JSON.stringify(dadosNuvem));
            }
        }
    } catch (e) {
        console.warn("Usando base de entregas local.", e);
    }

    let entregas = JSON.parse(localStorage.getItem("registro_entregas")) || [];
    let ativas = entregas.filter(e => e.status === "Pendente" || e.status === "Em Trânsito");

    let totalNaLoja = entregas.filter(e => e.status === "Pendente").length;
    let totalNoCarro = entregas.filter(e => e.status === "Em Trânsito").length;

    let rotasAgrupadas = {};
    ativas.forEach(e => {
        let numRota = e.rota || e.ROTA || "1";
        let identificadorRota = "ROTA " + numRota;
        
        if (!rotasAgrupadas[identificadorRota]) {
            rotasAgrupadas[identificadorRota] = {
                entregas: [],
                totalCaixas: 0,
                totalGelados: 0
            };
        }
        
        rotasAgrupadas[identificadorRota].entregas.push(e);
        rotasAgrupadas[identificadorRota].totalCaixas += parseInt(e.caixas || e.volumes || 0, 10);
        
        if (e.gelados === "Sim" || e.GELADOS === "Sim") {
            rotasAgrupadas[identificadorRota].totalGelados += 1;
        }
    });

    container.innerHTML = `
        <div class="topo" style="background:#5cb85c;">
            <h1>🚚 ROTEIRO DO MOTORISTA</h1>
            <div style="display:flex; justify-content:space-around; margin-top:10px; font-size:13px; background:rgba(0,0,0,0.1); padding:8px; border-radius:6px;">
                <span>🏪 Na Loja: <strong>${totalNaLoja} compras</strong></span>
                <span>🛣️ No Carro: <strong>${totalNoCarro} compras</strong></span>
            </div>
        </div>

        <div style="padding: 15px; text-align: left;">
            
            ${ativas.length === 0 ? `
                <div style="text-align:center; padding:30px; color:#666;">
                    🎉 <b>Excelente!</b> Nenhuma entrega pendente na loja ou no carro.
                </div>
            ` : `
                ${Object.keys(rotasAgrupadas).sort((a, b) => {
                    let numA = parseInt(a.replace(/\D/g, ''), 10) || 0;
                    let numB = parseInt(b.replace(/\D/g, ''), 10) || 0;
                    return numA - numB;
                }).map(nomeRota => {
                    let dadosRota = rotasAgrupadas[nomeRota];
                    let deveAbrir = (nomeRota === rotaParaManterAberta) ? "open" : "";
                    
                    return `
                    <details ${deveAbrir} id="det-${nomeRota.replace(/\s+/g, '')}" ontoggle="if(this.open) { window.lastOpenedRoute = '${nomeRota}'; }" style="background:#fff; border:1px solid #ddd; border-radius:8px; margin-bottom:15px; box-shadow:0 2px 4px rgba(0,0,0,0.05); overflow:hidden;">
                        
                        <summary style="background:#e2f0d9; color:#385723; padding:12px; font-weight:bold; font-size:14px; border-bottom:1px solid #bcd; line-height:1.5; cursor:pointer; outline:none;">
                            <span style="font-size:15px; display:block; margin-bottom:4px;">📍 ${nomeRota.toUpperCase()}</span>
                            📋 Entregas ${dadosRota.entregas.length}<br>
                            📦 Caixas ${dadosRota.totalCaixas}
                            ${dadosRota.totalGelados > 0 ? `<br>❄️ Gelado ${dadosRota.totalGelados}` : ''}
                        </summary>
                        
                        <div style="padding:10px; background:#fdfdfd;">
                            ${dadosRota.entregas.map(item => {
                                let noCarro = item.status === "Em Trânsito";
                                return `
                                <div style="padding:12px 0; border-bottom:1px solid #eee; background:${noCarro ? '#f7faff' : 'transparent'}; border-left: ${noCarro ? '4px solid #0275d8' : 'none'}; padding-left: ${noCarro ? '8px' : '0px'};">
                                    <span style="font-size:11px; color:#777; float:right;">⏱️ ${item.horaLancamento || ''}</span>
                                    
                                    <span style="font-size:11px; float:right; margin-right:10px; background:${noCarro ? '#0275d8' : '#e67e22'}; color:white; padding:1px 5px; border-radius:4px; font-weight:bold;">
                                        ${noCarro ? '🛣️ NO CARRO' : '🏪 NA LOJA'}
                                    </span>

                                    <strong style="font-size:15px; color:#333;">👤 ${item.cliente}</strong>
                                    <p style="margin:4px 0; font-size:13px; color:#555;">
                                        🏠 ${item.rua}, Nº ${item.numero} ${item.apartamento === 'Sim' ? '<b>(' + (item.apartamentoDetalhe || item.detalheApto || '') + ')</b>' : ''}
                                    </p>
                                    <p style="margin:2px 0; font-size:12px; color:#888;">🏡 Bairro: ${item.bairro} | 🏙️ ${item.cidade || ''}</p>
                                    
                                    <div style="margin:5px 0; font-size:13px;">
                                        📦 <b>Volumes:</b> <span style="background:#ddd; padding:2px 6px; border-radius:4px; font-weight:bold;">${item.caixas || item.volumes || 0}</span>
                                        ${item.gelados === 'Sim' ? `<span style="background:#b0cedb; color:#0c5460; padding:2px 6px; border-radius:4px; font-weight:bold; margin-left:5px; font-size:11px;">❄️ Contém Gelados</span>` : ''}
                                    </div>

                                    <div style="margin-top:10px;">
                                        ${!noCarro ? `
                                            <button onclick="inserirCompraNaRota(${item.idEntrega || item.id}, '${nomeRota}')" style="width:100%; padding:8px; background:#0275d8; color:white; border:none; border-radius:4px; font-weight:bold; font-size:12px; cursor:pointer;">
                                                🚚 Inserir esta compra no Carro
                                            </button>
                                        ` : `
                                            <div style="display:flex; gap:5px;">
                                                <button onclick="mudarStatusEntrega(${item.idEntrega || item.id}, 'Entregue', '${nomeRota}')" style="flex:1; padding:8px; background:#28a745; color:white; border:none; border-radius:4px; font-weight:bold; font-size:12px; cursor:pointer;">✅ Entregue</button>
                                                <button onclick="mudarStatusEntrega(${item.idEntrega || item.id}, 'Não Recebida', '${nomeRota}')" style="flex:1; padding:8px; background:#f0ad4e; color:white; border:none; border-radius:4px; font-weight:bold; font-size:12px; cursor:pointer;">❌ Não Rec.</button>
                                                <button onclick="mudarStatusEntrega(${item.idEntrega || item.id}, 'Não Localizada', '${nomeRota}')" style="flex:1; padding:8px; background:#d9534f; color:white; border:none; border-radius:4px; font-weight:bold; font-size:12px; cursor:pointer;">📍 Não Loc.</button>
                                            </div>
                                        `}
                                    </div>
                                </div>
                                `;
                            }).join("")}
                        </div>
                    </details>
                    `;
                }).join("")}
            `}

            <button onclick="voltarMenuPrincipal()" style="width:100%; padding:12px; background:#6c757d; color:white; border:none; border-radius:6px; margin-top:15px; cursor:pointer; font-weight:bold; font-size:14px;">
                ↩ Voltar ao Menu
            </button>
        </div>
    `;
}

// --- ATUALIZAÇÃO DE STATUS NA NUVEM ---
async function inserirCompraNaRota(idEntrega, nomeRota) {
    let entregas = JSON.parse(localStorage.getItem("registro_entregas")) || [];
    let item = entregas.find(e => (e.idEntrega || e.id) == idEntrega);

    if (item) {
        item.status = "Em Trânsito";
        localStorage.setItem("registro_entregas", JSON.stringify(entregas));

        try {
            if (typeof URL_API_GAS !== 'undefined' && URL_API_GAS) {
                await fetch(URL_API_GAS, {
                    method: "POST",
                    mode: "no-cors",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        acao: "atualizarStatusEntrega",
                        idEntrega: item.idEntrega || item.id,
                        status: "Em Trânsito"
                    })
                });
            }
        } catch (e) {
            console.warn("Erro ao atualizar status na nuvem.", e);
        }

        abrirAbaMotoristaEntrega(nomeRota || window.lastOpenedRoute); 
    }
}

async function mudarStatusEntrega(idEntrega, novoStatus, nomeRota) {
    let entregas = JSON.parse(localStorage.getItem("registro_entregas")) || [];
    let entregaEncontrada = entregas.find(e => (e.idEntrega || e.id) == idEntrega);
    
    if (entregaEncontrada) {
        entregaEncontrada.status = novoStatus;
        
        if (novoStatus === 'Entregue') {
            entregaEncontrada.horaFinalizacao = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        }
        
        localStorage.setItem("registro_entregas", JSON.stringify(entregas));
        
        try {
            if (typeof URL_API_GAS !== 'undefined' && URL_API_GAS) {
                await fetch(URL_API_GAS, {
                    method: "POST",
                    mode: "no-cors",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        acao: "atualizarStatusEntrega",
                        idEntrega: entregaEncontrada.idEntrega || entregaEncontrada.id,
                        status: novoStatus,
                        horaFinalizacao: entregaEncontrada.horaFinalizacao || ""
                    })
                });
            }
        } catch (e) {
            console.warn("Erro ao atualizar status final na nuvem.", e);
        }
        
        alert(`📦 Entrega de ${entregaEncontrada.cliente} marcada como: ${novoStatus}!`);
        abrirAbaMotoristaEntrega(nomeRota || window.lastOpenedRoute);
    } else {
        alert("⚠️ Erro: Entrega não encontrada na base de dados.");
    }
}
