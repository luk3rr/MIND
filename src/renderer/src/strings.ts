/*
 * Filename: strings.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

/** Texts shown to the user (pt-BR). */
export const T = {
  skipLink: "Pular para o conteúdo",
  mainNav: "Principal",
  workspace: "Workspace",
  newWorkspace: "Novo workspace",
  renameWorkspace: "Renomear",
  deleteWorkspace: "Excluir",
  workspaceName: "Nome do workspace",
  create: "Criar",
  save: "Salvar",
  cancel: "Cancelar",
  confirmDelete: "Excluir workspace",
  confirmDeleteBody: (name: string) =>
    `Excluir o workspace "${name}" apaga todos os seus materiais, cards e histórico. Isso não pode ser desfeito.`,
  toggleTheme: "Alternar tema claro/escuro",
  themeDark: "Tema escuro",
  themeLight: "Tema claro",
  providerNone: "Provedor: não configurado",
  quickGo: "Ir para",
  quickPlaceholder: "Digite para filtrar as seções",
  quickHint: "Ctrl+K ir para",
  welcomeTitle: "Bem-vindo ao MIND",
  welcomeBody: "Crie seu primeiro workspace para organizar um assunto de estudo.",
  today: "Hoje",
  todayMaterials: "Materiais",
  todayCards: "Cards aprovados",
  todayQuestions: "Questões aprovadas",
  todayEmptyTitle: "Nenhum material ainda",
  todayEmptyBody: "Importe um PDF, um documento ou uma página web para começar a gerar cards.",
  todayEmptyAction: "Ir para a Biblioteca",
  loadError: "Não foi possível carregar os dados.",
  retry: "Tentar de novo",
  loading: "Carregando",
  comingSoon: "Esta seção chega em breve.",
  unknownError: "Algo deu errado.",
} as const;
