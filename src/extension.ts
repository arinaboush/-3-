
import * as vscode from 'vscode';

/*
  Интерфейс одной задачи.
  Содержит название задачи и информацию о её выполнении.
 */
interface Task {
    name: string;
    completed: boolean;
}
/*
  Основная функция активации расширения.
  Регистрирует команды, создаёт Webview и настраивает обработчики событий.
 
  @param context контекст расширения VS Code
 */
export function activate(context: vscode.ExtensionContext) {
    console.log('Планер задач активирован');
    /*
      Получает список задач из глобального хранилища VS Code.
      Если задача сохранена в старом формате (строка),
      преобразует её в объект Task.
     
      @returns массив задач
     */
    const getTasks = (): Task[] => {
        const savedTasks = context.globalState.get<(string | Task)[]>('tasks', []);
        return savedTasks.map(task => {
            if (typeof task === 'string') {
                return {
                    name: task,
                    completed: false
                };
            }
            return task;
        });
    };
    // Ссылка на открытое представление Webview.
    let tasksView: vscode.WebviewView | undefined;
    /*
      Экранирует специальные HTML-символы.
      Это позволяет безопасно отображать названия задач в HTML.
     
      @param text исходный текст
      @returns текст с заменёнными HTML-символами
     */
    const escapeHtml = (text: string): string => {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    };
    /*
      Обновляет содержимое боковой панели.
      Получает актуальный список задач и формирует HTML-интерфейс.
      Если Webview не открыт, обновление не выполняется.
     */
    const updateTasksView = () => {
        if (!tasksView) {
            return;
        }
        const tasks = getTasks();
        // Формирование HTML-разметки для каждой задачи.
        const taskList = tasks.map((task, index) => `
            <div class="task">
                <span class="${task.completed ? 'done' : ''}">
                    ${escapeHtml(task.name)}
                </span>
                <div class="buttons">
                    <button
                        data-action="toggle"
                        data-index="${index}"
                        title="${task.completed ? 'Вернуть задачу' : 'Выполнить задачу'}">
                        ${task.completed ? '↶' : '✓'}
                    </button>
                    <button
                        class="delete"
                        data-action="delete"
                        data-index="${index}"
                        title="Удалить задачу">
                        ×
                    </button>
                </div>
            </div>
        `).join('');
        // Создание HTML-страницы Webview.
        tasksView.webview.html = `
            <!DOCTYPE html>
            <html lang="ru">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <style>
                    body {
                        padding: 15px;
                        color: var(--vscode-foreground);
                        font-family: var(--vscode-font-family);
                    }
                    .smile {
                        text-align: center;
                        font-size: 45px;
                        margin-bottom: 25px;
                    }
                    .task {
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        gap: 10px;
                        padding: 12px;
                        margin-bottom: 8px;
                        border-radius: 8px;
                        background: var(--vscode-editor-inactiveSelectionBackground);
                    }
                    .task span {
                        overflow-wrap: anywhere;
                    }
                    .done {
                        text-decoration: line-through;
                        opacity: 0.6;
                    }
                    .buttons {
                        display: flex;
                        gap: 5px;
                        flex-shrink: 0;
                    }
                    button {
                        border: none;
                        border-radius: 5px;
                        padding: 5px 9px;
                        cursor: pointer;
                        color: var(--vscode-button-foreground);
                        background: var(--vscode-button-background);
                    }
                    button:hover {
                        background: var(--vscode-button-hoverBackground);
                    }
                    .delete {
                        background: var(--vscode-inputValidation-errorBackground);
                        color: var(--vscode-foreground);
                    }
                </style>
            </head>
            <body>
                <div class="smile">📝</div>
                ${taskList}
                <script>
                    // Получение API для обмена сообщениями с расширением.
                    const vscode = acquireVsCodeApi();
                    // Обработка нажатий на кнопки задач.
                    document.addEventListener('click', event => {
                        if (!(event.target instanceof HTMLElement)) {
                            return;
                        }
                        const button = event.target.closest('button');
                        if (!button) {
                            return;
                        }
                        // Передача действия и индекса задачи в основную часть расширения.
                        vscode.postMessage({
                            command: button.dataset.action,
                            index: Number(button.dataset.index)
                        });
                    });
                </script>
            </body>
            </html>
        `;
    };
    /*
      Провайдер представления задач.
      Настраивает Webview и обрабатывает сообщения от интерфейса.
     */
    const provider: vscode.WebviewViewProvider = {
        /*
          Вызывается VS Code при создании представления Webview.
         
          @param webviewView объект представления Webview
         */
        resolveWebviewView(webviewView) {
            tasksView = webviewView;
            // Разрешение выполнения JavaScript внутри Webview.
            webviewView.webview.options = {
                enableScripts: true
            };
            /*
              Обрабатывает сообщения, полученные от Webview.
              Изменяет статус задачи или удаляет её.
              После изменения сохраняет список и обновляет интерфейс.
             */
            webviewView.webview.onDidReceiveMessage(async message => {
                const tasks = getTasks();
                // Проверка корректности индекса задачи.
                if (
                    !Number.isInteger(message.index) ||
                    message.index < 0 ||
                    message.index >= tasks.length
                ) {
                    return;
                }
                // Изменение статуса выполнения задачи.
                if (message.command === 'toggle') {
                    tasks[message.index].completed =
                        !tasks[message.index].completed;
                }
                // Удаление выбранной задачи.
                if (message.command === 'delete') {
                    tasks.splice(message.index, 1);
                }
                // Сохранение изменений и обновление интерфейса.
                await context.globalState.update('tasks', tasks);
                updateTasksView();
            });
            // Первоначальное отображение списка задач.
            updateTasksView();
            // Сброс ссылки при закрытии представления.
            webviewView.onDidDispose(() => {
                tasksView = undefined;
            });
        }
    };
    // Регистрация представления планера в боковой панели VS Code.
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            'planner.tasksView',
            provider
        )
    );
    /*
      Команда добавления новой задачи.
      Запрашивает название, добавляет задачу в список и сохраняет изменения.
     */
    const disposable = vscode.commands.registerCommand('planner.addTask', async () => {
        const task = await vscode.window.showInputBox({
            prompt: 'Введите название задачи'
        });
        if (task) {
            const tasks = getTasks();
            tasks.push({
                name: task,
                completed: false
            });
            await context.globalState.update('tasks', tasks);
            updateTasksView();
            vscode.window.showInformationMessage('Задача сохранена: ' + task);
        }
    });
    context.subscriptions.push(disposable);
    /*
      Команда просмотра списка задач.
      Показывает названия задач и их текущий статус.
     */
    const showTasks = vscode.commands.registerCommand('planner.showTasks', () => {
        const tasks = getTasks();
        if (tasks.length === 0) {
            vscode.window.showInformationMessage('Список задач пуст');
            return;
        }
        const message = tasks.map(task =>
            task.name + (task.completed ? ' — выполнена' : ' — не выполнена')
        ).join('\n');
        vscode.window.showInformationMessage(message);
    });
    context.subscriptions.push(showTasks);
    /*
      Команда удаления задачи.
      Предлагает пользователю выбрать задачу из списка,
      удаляет её и сохраняет изменения.
     */
    const deleteTask = vscode.commands.registerCommand('planner.deleteTask', async () => {
        const tasks = getTasks();
        if (tasks.length === 0) {
            vscode.window.showInformationMessage('Нет задач для удаления');
            return;
        }
        const selectedTask = await vscode.window.showQuickPick(
            tasks.map((task, index) => ({
                label: task.name,
                index: index
            })),
            {
                placeHolder: 'Выберите задачу для удаления'
            }
        );
        if (selectedTask) {
            tasks.splice(selectedTask.index, 1);
            await context.globalState.update('tasks', tasks);
            updateTasksView();
            vscode.window.showInformationMessage(
                'Задача удалена: ' + selectedTask.label
            );
        }
    });
    context.subscriptions.push(deleteTask);
    /*
      Команда отметки задачи как выполненной.
      Предлагает выбрать задачу, меняет её статус и сохраняет изменения.
     */
    const completeTask = vscode.commands.registerCommand('planner.completeTask', async () => {
        const tasks = getTasks();
        if (tasks.length === 0) {
            vscode.window.showInformationMessage('Список задач пуст');
            return;
        }
        const selectedTask = await vscode.window.showQuickPick(
            tasks.map((task, index) => ({
                label: task.name,
                description: task.completed ? 'Выполнена' : 'Не выполнена',
                index: index
            })),
            {
                placeHolder: 'Выберите задачу для выполнения'
            }
        );
        if (selectedTask) {
            tasks[selectedTask.index].completed = true;

            await context.globalState.update('tasks', tasks);
            updateTasksView();

            vscode.window.showInformationMessage(
                'Задача выполнена: ' + selectedTask.label
            );
        }
    });

    context.subscriptions.push(completeTask);
}
/*
  Функция деактивации расширения.
  Дополнительные действия при завершении работы не требуются.
 */
export function deactivate() {}
