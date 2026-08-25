import { useState, useRef, useEffect, KeyboardEvent, useCallback } from "react"
import { PlusIcon } from "@/assets/icons/ExportSvg"

import styles from "./Assistant.module.scss"
import { useChatSocket } from "@/hooks/useChatSocket"
import { createChat, uploadFile } from "../../services/api"

interface AssistantProps {
    activeChatId: string | null;
    userId: string;
    setChats: React.Dispatch<React.SetStateAction<{ chatId: string; title: string }[]>>;
    setActiveChatId: (id: string | null) => void;
}



const TypewriterText = ({ content, onRender, onUpdate, onComplete }: { content: string, onRender: (text: string) => any, onUpdate?: () => void, onComplete?: () => void }) => {
    const [displayedText, setDisplayedText] = useState("");
    
    useEffect(() => {
        if (displayedText.length >= content.length) {
            onComplete?.();
            return;
        }

        const diff = content.length - displayedText.length;
        const delay = diff > 100 ? 1 : (diff > 20 ? 5 : 25);
        
        const timeout = setTimeout(() => {
            setDisplayedText(content.substring(0, displayedText.length + 1));
            onUpdate?.();
        }, delay);
        
        return () => clearTimeout(timeout);
    }, [content, displayedText, onUpdate, onComplete]);

    return <>{onRender(displayedText)}</>;
}

const Assistant = ({ activeChatId, userId, setChats, setActiveChatId }: AssistantProps) => {
    const [inputValue, setInputValue] = useState("")
    const [pendingMessage, setPendingMessage] = useState<string | null>(null);
    const [isFileUploading, setIsFileUploading] = useState(false);
    const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleCopyMessage = (text: string, index: number) => {
        navigator.clipboard.writeText(text);
        setCopiedIndex(index);
        setTimeout(() => {
            setCopiedIndex(null);
        }, 2000);
    };
    
    const handleChatUpdated = useCallback((chatId: string, title: string) => {
        setChats(prev => prev.map(chat => 
            chat.chatId === chatId ? { ...chat, title } : chat
        ));
    }, [setChats]);

    const { messages, isStreaming, isLoading, isHistoryLoaded, estimatedTimeMs, sendMessage } = useChatSocket(activeChatId, userId, handleChatUpdated);
    const [isCurrentlyTyping, setIsCurrentlyTyping] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null)
    
    useEffect(() => {
        if (isStreaming) {
            setIsCurrentlyTyping(true);
        }
    }, [isStreaming]);

    const scrollToBottom = (behavior: "smooth" | "auto" = "smooth") => {
        messagesEndRef.current?.scrollIntoView({ behavior })
    }

    useEffect(() => {
        scrollToBottom("smooth")
    }, [messages, isLoading])

    const handleSendMessage = async () => {
        if (!inputValue.trim() || isStreaming) return;

        if (!activeChatId) {
            setPendingMessage(inputValue);
            setInputValue("");
            try {
                const data = await createChat(userId);
                const newChat = data.chat;
                setChats(prev => [{ chatId: newChat.chatId, title: newChat.title || 'New Chat' }, ...prev]);
                setActiveChatId(newChat.chatId);
            } catch (error) {
                console.error("Failed to create chat:", error);
                setPendingMessage(null);
            }
        } else {
            sendMessage(inputValue);
            setInputValue("");
        }
    }

    useEffect(() => {
        if (activeChatId && pendingMessage && isHistoryLoaded && !isStreaming) {
            sendMessage(pendingMessage);
            setPendingMessage(null);
        }
    }, [activeChatId, pendingMessage, isHistoryLoaded, isStreaming, sendMessage]);

    const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter" && !isStreaming) {
            handleSendMessage()
        }
    }

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsFileUploading(true);
        try {
            console.log("Uploading file:", file.name);
            const data = await uploadFile(file);
            console.log("File ingested successfully:", data);
            
            const notice = `I have successfully uploaded and parsed your document: "${file.name}" (${data.chunks_count} chunks). You can now ask questions about its content!`;
            
            if (activeChatId) {
                sendMessage(notice);
            } else {
                const chatData = await createChat(userId);
                const newChat = chatData.chat;
                setChats(prev => [{ chatId: newChat.chatId, title: newChat.title || 'New Chat' }, ...prev]);
                setActiveChatId(newChat.chatId);
                setPendingMessage(notice);
            }
        } catch (error: any) {
            console.error("Failed to upload manual:", error);
            alert("Failed to upload manual: " + (error.response?.data?.error || error.message));
        } finally {
            setIsFileUploading(false);
            if (fileInputRef.current) {
                fileInputRef.current.value = "";
            }
        }
    };

    const renderMessageContent = (content: string) => {
        const lines = content.split('\n');
        const renderedBlocks: JSX.Element[] = [];
        let currentTableRows: string[] = [];

        const valueRegex = /(\b\d+(?:,\d+)*(?:\.\d+)?\s*(?:V|A|W|Wh|kWh|kW|MW|Hz|%|watts|volts|amps|kilowatts|hours|unit|units)\b)/gi;

        // Helper for parts within a line
        function renderMessageContentParts(text: string) {
            const cleaned = text
                .replace(/[\u2020\u2021\u00a7\u00b6\u2016]/g, '')
                .replace(/\|\|/g, '')
                .replace(/(\b\d+)\*/g, '$1')
                .replace(/^\/\/+\*?\s*/, '');

            let lineParts: (string | JSX.Element)[] = [cleaned];
            // Bold (Double asterisks)
            lineParts = lineParts.flatMap(lp => {
                if (typeof lp !== 'string') return lp;
                const sub = lp.split(/(\*\*[^*]+?\*\*)/g);
                return sub.map((s, i) => s.startsWith('**') && s.endsWith('**') ? <strong key={`double-${i}`}>{s.slice(2, -2)}</strong> : s);
            });
            // Bold (Single asterisks - mapped to bold per user request)
            lineParts = lineParts.flatMap(lp => {
                if (typeof lp !== 'string') return lp;
                const sub = lp.split(/(\*[^*]+?\*)/g);
                return sub.map((s, i) => s.startsWith('*') && s.endsWith('*') ? <strong key={`single-${i}`}>{s.slice(1, -1)}</strong> : s);
            });
            // Values
            lineParts = lineParts.flatMap(lp => {
                if (typeof lp !== 'string') return lp;
                const sub = lp.split(valueRegex);
                return sub.map((s, i) => s.match(valueRegex) ? <span key={i} className={styles.valueHighlight}>{s}</span> : s);
            });
            return lineParts;
        }

        const renderTable = (rows: string[], tableKey: string) => {
            if (rows.length === 0) return null;
            
            // First row: header
            const headerCells = rows[0]
                .split('|')
                .map(c => c.trim())
                .filter((_, i, arr) => i > 0 && i < arr.length - 1); // remove outer empty items from leading/trailing pipes
            
            // Filter out the divider row (typically the second row containing dashes)
            const bodyRowsData = rows.slice(1).filter(r => !r.includes('---'));

            return (
                <div key={tableKey} className={styles.tableContainer}>
                    <table className={styles.markdownTable}>
                        <thead>
                            <tr>
                                {headerCells.map((cell, idx) => (
                                    <th key={`th-${idx}`}>{renderMessageContentParts(cell)}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {bodyRowsData.map((rowText, rowIdx) => {
                                const cells = rowText
                                    .split('|')
                                    .map(c => c.trim())
                                    .filter((_, i, arr) => i > 0 && i < arr.length - 1);
                                return (
                                    <tr key={`tr-${rowIdx}`}>
                                        {cells.map((cell, cellIdx) => (
                                            <td key={`td-${rowIdx}-${cellIdx}`}>
                                                {renderMessageContentParts(cell)}
                                            </td>
                                        ))}
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            );
        };

        for (let idx = 0; idx < lines.length; idx++) {
            const line = lines[idx];
            const isTableRow = line.trim().startsWith('|') && line.includes('|', line.indexOf('|') + 1);

            if (isTableRow) {
                currentTableRows.push(line);
            } else {
                if (currentTableRows.length > 0) {
                    const tbl = renderTable(currentTableRows, `table-${idx}`);
                    if (tbl) renderedBlocks.push(tbl);
                    currentTableRows = [];
                }

                // Parse normal line
                const trimmed = line.trim();
                const imageMatch = trimmed.match(/!\[(.*?)\]\((.*?)\)/);
                if (imageMatch) {
                    const alt = imageMatch[1];
                    const url = imageMatch[2];
                    renderedBlocks.push(
                        <img 
                            key={`img-${idx}`} 
                            src={url} 
                            alt={alt} 
                            style={{ 
                                maxWidth: '100%', 
                                maxHeight: '400px', 
                                borderRadius: '12px', 
                                marginTop: '12px', 
                                marginBottom: '12px', 
                                display: 'block', 
                                border: '1px solid #e2e8f0',
                                boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.05)'
                            }} 
                        />
                    );
                } else if (trimmed.startsWith('* ') || trimmed.startsWith('- ')) {
                    const inner = trimmed.substring(2);
                    renderedBlocks.push(
                        <li key={`li-${idx}`} className={styles.listItem}>
                            {renderMessageContentParts(inner)}
                        </li>
                    );
                } else if (trimmed === '---') {
                    renderedBlocks.push(<hr key={`hr-${idx}`} className={styles.horizontalRule} />);
                } else if (trimmed.startsWith('#### ')) {
                    renderedBlocks.push(
                        <h4 key={`h4-${idx}`} className={styles.heading4}>
                            {renderMessageContentParts(trimmed.substring(5))}
                        </h4>
                    );
                } else if (trimmed.startsWith('### ')) {
                    renderedBlocks.push(
                        <h3 key={`h3-${idx}`} className={styles.heading3}>
                            {renderMessageContentParts(trimmed.substring(4))}
                        </h3>
                    );
                } else if (trimmed.startsWith('## ')) {
                    renderedBlocks.push(
                        <h2 key={`h2-${idx}`} className={styles.heading2}>
                            {renderMessageContentParts(trimmed.substring(3))}
                        </h2>
                    );
                } else if (trimmed.startsWith('> ')) {
                    renderedBlocks.push(
                        <blockquote key={`quote-${idx}`} className={styles.blockquote}>
                            {renderMessageContentParts(trimmed.substring(2))}
                        </blockquote>
                    );
                } else if (trimmed === '') {
                    renderedBlocks.push(<div key={`br-${idx}`} className={styles.lineBreak} />);
                } else {
                    renderedBlocks.push(
                        <div key={`p-${idx}`} className={styles.paragraph}>
                            {renderMessageContentParts(line)}
                        </div>
                    );
                }
            }
        }

        // Catch any trailing table block
        if (currentTableRows.length > 0) {
            const tbl = renderTable(currentTableRows, `table-end`);
            if (tbl) renderedBlocks.push(tbl);
        }

        return renderedBlocks;
    };

    return (
        <div className={styles["assistant-container"]}> 
            <div className={styles["messages-view"]}>
                {!activeChatId || messages.length === 0 ? (
                    <div className={styles.introBox}>
                        <div className={styles.agentAvatar}>
                            {/* {selectedAgent.name[0]} */}
                            P
                        </div>
                        <h2>How can Plixy help?</h2>
                        {!activeChatId ? (
                             <p>Type a message below to start a new chat.</p>
                        ) : (
                             <p>Unlock the power of your IIoT data with specialized AI agents.</p>
                        )}
                    </div>
                ) : null}

                {/* Chat messages */}
                {activeChatId && (
                    <div className={styles.messagesList}>
                        {messages.map((msg, idx) => {
                            const isLastMessage = idx === messages.length - 1;
                            // Only animate if it's the last AI message AND we are (or were just) streaming
                            const isNewAIMessage = isLastMessage && msg.role === 'ai' && (isStreaming || (isCurrentlyTyping && isLastMessage));
                            
                            // Don't show empty AI bubbles (avoid "2 loading" bubbles)
                            if (msg.role === 'ai' && !msg.content.trim() && isLastMessage && isLoading) return null;

                            return (
                                <div key={idx} className={`${styles.messageWrapper} ${msg.role === 'ai' ? styles.assistant : styles.user}`}>
                                    <div className={styles.messageBubbleContainer}>
                                        <div className={styles.messageBubble}>
                                            {isNewAIMessage ? (
                                                <TypewriterText 
                                                    content={msg.content} 
                                                    onRender={renderMessageContent} 
                                                    onUpdate={() => scrollToBottom("auto")}
                                                    onComplete={() => {
                                                        if (!isStreaming) setIsCurrentlyTyping(false);
                                                    }}
                                                />
                                            ) : (
                                                renderMessageContent(msg.content)
                                            )}
                                            {isStreaming && isLastMessage && msg.role === 'ai' && (
                                                <span className={styles.streamingCursor}></span>
                                            )}
                                        </div>
                                        {msg.role === 'ai' && (
                                            <div className={styles.messageActions}>
                                                {msg.responseTime && (
                                                    <span className={styles.responseTimeInfo}>
                                                        Generated in {(msg.responseTime / 1000).toFixed(2)}s
                                                    </span>
                                                )}
                                                <button 
                                                    className={styles.copyBtn} 
                                                    onClick={() => handleCopyMessage(msg.content, idx)}
                                                    title="Copy response to clipboard"
                                                >
                                                    {copiedIndex === idx ? (
                                                        <span className={styles.copiedFeedback}>✓ Copied</span>
                                                    ) : (
                                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                                                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                                                        </svg>
                                                    )}
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                        
                        {isLoading && (
                            <div className={`${styles.messageWrapper} ${styles.assistant}`}>
                                <div className={styles.typingContainer}>
                                    <div className={`${styles.messageBubble} ${styles.typingIndicator}`}>
                                        <span></span>
                                        <span></span>
                                        <span></span>
                                    </div>
                                    {estimatedTimeMs !== null && (
                                        <div className={styles.estimatedTime}>
                                            Estimated response: ~{(estimatedTimeMs / 1000).toFixed(1)}s
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                        
                        <div ref={messagesEndRef} />
                    </div>
                )}
            </div>

            <div className={styles["input-container"]}>
                <div className={styles["composer-card"]}>
                    {/* Chat box  */}
                    <div className={styles["input-wrapper"]}>
                        <div 
                            className={`${styles.uploadBtn} ${isFileUploading ? styles.loading : ""}`}
                            onClick={() => !isFileUploading && fileInputRef.current?.click()}
                            title="Upload document manual (PDF, Excel, Word, Zip, text, images)"
                        >
                            {isFileUploading ? <span className={styles.spinner}></span> : <PlusIcon />}
                        </div>
                        <input
                            type="file"
                            ref={fileInputRef}
                            style={{ display: "none" }}
                            onChange={handleFileChange}
                            accept=".pdf,.docx,.xlsx,.xls,.csv,.json,.xml,.html,.htm,.md,.txt,.pptx,.zip,.png,.jpg,.jpeg"
                        />
                        <input
                            type="text"
                            placeholder={activeChatId ? `Talk to Plixy ...` : "Start a new chat..."}
                            value={inputValue}
                            onChange={(e) => setInputValue(e.target.value)}
                            onKeyDown={handleKeyDown}
                            autoFocus
                        />

                        <button
                            className={`${styles.sendBtn} ${inputValue && !isStreaming ? styles.ready : ''}`}
                            onClick={handleSendMessage}
                            disabled={!inputValue.trim() || isStreaming}
                        >
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="22" y1="2" x2="11" y2="13"></line>
                                <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                            </svg>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}

export default Assistant