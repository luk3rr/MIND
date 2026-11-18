# Técnicas de estudo e o MIND

Este documento resume, com palavras próprias, as técnicas de estudo reunidas no livro
_Fixe o Conhecimento: a ciência da aprendizagem bem-sucedida_ (BROWN, P. C. et al.) e registra
como o MIND aplica cada uma. Serve de guia de conferência: onde o app já atende, onde atende em
parte e o que ainda falta.

> **Sobre este resumo.** É uma síntese interpretativa para orientar o desenvolvimento, não uma
> reprodução do livro. Os nomes das técnicas seguem o uso comum na literatura e podem diferir dos
> usados na edição brasileira. Para os detalhes e as evidências, consulte o livro.
>
> Levantamento feito sobre o código da versão 0.7.0 (novembro de 2026).

## Resumo

| Técnica                                    | Status        |
| ------------------------------------------ | ------------- |
| Recuperação ativa (testar-se)              | Atende        |
| Repetição espaçada                         | Atende        |
| Feedback e correção dos erros              | Atende        |
| Aprender com os erros                      | Atende        |
| Dificuldades desejáveis (variar a prática) | Parcial       |
| Elaboração                                 | Parcial       |
| Geração (tentar antes de ver a resposta)   | Parcial       |
| Calibração (ilusão de saber)               | Parcial       |
| Intercalação                               | Não atende    |
| Pré-teste (testar antes de estudar)        | Não atende    |
| Reflexão sobre o que foi aprendido         | Não atende    |
| Estilos de aprendizagem                    | Não se aplica |
| Mnemônicos e palácio da memória            | Não se aplica |

## Técnicas

### Recuperação ativa

**Ideia.** Tentar lembrar o que se estudou fortalece a memória mais do que reler. O esforço de
recuperar a informação é o que a consolida, e testar-se também mostra o que ainda não foi aprendido.

**No MIND.** Atende. Os flashcards escondem o verso até o usuário tentar lembrar (revelar com
Espaço), e as questões de prova exigem uma resposta antes de mostrar o gabarito. Não há modo de
estudo que se limite a reler o material.

**Onde está.** `src/core/study` (cards), `src/core/practice` (questões), páginas Estudar e Praticar.

### Repetição espaçada

**Ideia.** Revisar em intervalos crescentes, no momento em que o esquecimento começa, retém mais do
que concentrar as revisões em uma sessão só.

**No MIND.** Atende. O agendamento usa o FSRS, com retenção desejada configurável (padrão 90%),
passos de aprendizado e reaprendizado, intervalo máximo e dispersão (_fuzz_) dos intervalos. A fila
do dia traz primeiro os cards em aprendizado, depois as revisões e por fim os novos, com limite
diário de cards novos e meta diária.

**Onde está.** `src/core/study/scheduler.ts`, `src/core/study/service.ts`.

### Feedback e correção dos erros

**Ideia.** Testar só ajuda de fato quando o erro é corrigido. O feedback deve vir logo e explicar
por que a resposta certa é a certa.

**No MIND.** Atende. Ao responder uma questão, o app mostra o gabarito, o comentário e, para cada
alternativa, o motivo de estar certa ou errada. Cada card gerado cita a passagem de origem e abre o
PDF na página citada.

**Onde está.** `src/core/practice/service.ts`, `src/renderer/src/pages/PracticePage.tsx`.

### Aprender com os erros

**Ideia.** Os erros mostram onde está a lacuna. Revisitá-los e treiná-los no ponto fraco rende mais
do que repetir o que já se sabe.

**No MIND.** Atende. As questões erradas voltam à fila de prática antes das já acertadas, a página
Erros reúne cards e questões que falharam, uma questão errada pode virar um card no caderno de erros
e o app gera novos itens sobre os trechos em que o usuário mais errou.

**Onde está.** `src/core/notebook`, `src/core/generation/training.ts`, página Erros, tela Hoje.

### Dificuldades desejáveis (variar a prática)

**Ideia.** Um pouco de dificuldade durante o estudo, como variar o formato ou o contexto, torna a
aprendizagem mais duradoura, mesmo que o desempenho imediato pareça pior.

**No MIND.** Parcial. Há formatos variados: cards de pergunta e resposta, lacuna, comparação e
verdadeiro ou falso, além de questões de múltipla escolha, certo ou errado e de cálculo. A variação,
porém, não é uma estratégia do app: o usuário escolhe o formato, e nada mistura ou alterna os tipos
de propósito.

### Elaboração

**Ideia.** Explicar com as próprias palavras e ligar o conteúdo ao que já se sabe cria mais caminhos
para lembrar depois.

**No MIND.** Parcial. O usuário pode escrever seus próprios cards e questões, criá-los a partir de
um trecho do leitor e conversar com o chat sobre o material, que responde com citações. Faltam
atividades que peçam a explicação do usuário, como escrever um resumo próprio ou explicar um
conceito antes de ver a resposta.

### Geração

**Ideia.** Tentar resolver um problema ou formular uma resposta antes de ver a solução, mesmo
errando, deixa a aprendizagem posterior mais forte.

**No MIND.** Parcial. Nas questões, o usuário escolhe uma alternativa antes de ver o gabarito. Nos
cards, ele apenas pensa na resposta e se autoavalia, sem registrar o que respondeu.

### Calibração (ilusão de saber)

**Ideia.** Familiaridade não é domínio. Reler passa a sensação de que se sabe, e as pessoas julgam
mal o que aprenderam. Medidas objetivas ajudam a corrigir essa percepção.

**No MIND.** Parcial. As estatísticas dão uma medida objetiva: retenção, atividade, tópicos mais
fracos e tempo de estudo. Falta confrontar a expectativa do usuário com o resultado, por exemplo
pedir a confiança antes de responder e mostrar depois onde ela divergiu do acerto.

**Onde está.** `src/core/stats`, página Estatísticas.

### Intercalação

**Ideia.** Alternar assuntos ou tipos de problema na mesma sessão parece mais difícil do que
estudar um bloco por vez, mas ajuda a discriminar os conceitos e a reter por mais tempo.

**No MIND.** Não atende. A fila é ordenada por vencimento, e os cards novos entram na ordem de
aprovação, então os itens gerados de um mesmo material chegam juntos, em bloco. É possível filtrar
a sessão por tópico ou material, o que favorece o estudo em bloco. Não existe modo que misture
tópicos de propósito.

### Pré-teste (testar antes de estudar)

**Ideia.** Responder perguntas sobre um assunto antes de estudá-lo, mesmo sem saber, prepara a
atenção para o que importa e melhora a aprendizagem seguinte, desde que o erro seja seguido de
feedback.

**No MIND.** Não atende. Tecnicamente nada impede o usuário de gerar itens de um material e estudá-
los antes de lê-lo, mas o app não sabe se o material já foi lido, não incentiva a ordem e não
trata esse primeiro contato de forma diferente (um erro no pré-teste conta como um erro comum).

### Reflexão

**Ideia.** Parar para pensar no que foi aprendido, no que funcionou e no que ainda falta consolida
o conteúdo e ajuda a planejar o próximo estudo.

**No MIND.** Não atende. Não há espaço para o usuário revisar a própria sessão.

### Estilos de aprendizagem

**Ideia.** A crença de que cada pessoa aprende melhor em um "estilo" (visual, auditivo etc.) não
tem respaldo nas evidências. O que ajuda é escolher o método conforme o tipo de conteúdo.

**No MIND.** Não se aplica. O app não adapta o estudo a estilos de aprendizagem.

### Mnemônicos e palácio da memória

**Ideia.** Recursos mnemônicos ajudam a guardar listas e sequências, e funcionam melhor combinados
com as demais técnicas.

**No MIND.** Não se aplica por enquanto. O usuário pode escrever seus próprios cards com
mnemônicos, mas o app não oferece apoio específico.

## Propostas a partir da conferência

Em ordem sugerida de impacto e esforço:

1. **Modo de pré-teste.** Ao abrir um material novo, oferecer uma rodada curta de questões
   geradas dele, antes da leitura, com feedback no fim. Registrar a origem "pré-teste" para que os
   erros dessa fase não pesem como erros comuns nas estatísticas nem no agendamento.
2. **Calibração.** Pedir uma estimativa de confiança antes de revelar a resposta e mostrar, nas
   estatísticas, onde a confiança e o acerto divergiram.
3. **Intercalação.** Opção de misturar tópicos ou materiais na fila do dia e na prática.
4. **Geração nos cards.** Campo opcional para o usuário digitar a resposta antes de revelar o
   verso.
5. **Reflexão.** Ao fim da sessão, mostrar um resumo e um campo opcional de anotação.
6. **Elaboração.** Ação do tipo "explique com suas palavras" no leitor, com a comparação com o
   trecho citado.

## Como manter este documento

- Ao entregar uma funcionalidade ligada a uma técnica, atualize o status e a seção "No MIND".
- Ao rever uma técnica, confirme no livro e ajuste o resumo, mantendo-o em palavras próprias.
