import { LogoIcon, PlusIcon, ChatIcon, HistoryIcon, SettingsIcon, HelpIcon, UserIcon, MenuIcon } from "@/assets/icons/ExportSvg"
import styles from "./Sidebar.module.scss"
import { createChat } from "../../services/api"

interface SidebarProps {
    isCollapsed: boolean;
    setIsCollapsed: (value: boolean) => void;
    chats: { chatId: string; title: string }[];
    setChats: React.Dispatch<React.SetStateAction<{ chatId: string; title: string }[]>>;
    activeChatId: string | null;
    setActiveChatId: (id: string | null) => void;
    user: any;
    onLogout: () => void;
    viewMode?: 'chat' | 'cad_studio';
    setViewMode?: (mode: 'chat' | 'cad_studio') => void;
}

const Sidebar = ({ isCollapsed, setIsCollapsed, chats, setChats, activeChatId, setActiveChatId, user, onLogout, viewMode = 'chat', setViewMode }: SidebarProps) => {
    
    const handleNewChat = async () => {
        if (setViewMode) setViewMode('chat');
        try {
            const data = await createChat(user._id);
            const newChat = data.chat;
            setChats(prev => [{ chatId: newChat.chatId, title: newChat.title || 'New Chat' }, ...prev]);
            setActiveChatId(newChat.chatId);
        } catch (error) {
            console.error("Failed to create chat:", error);
        }
    };

    return (
        <div className={`${styles["sidebar-container"]} ${isCollapsed ? styles.collapsed : ''}`}>
            <div className={styles.top}>
                <div className={styles.header}>
                    {!isCollapsed && (
                        <div className={styles.logo}>
                            <div className={styles.logoIcon}><LogoIcon /></div>
                            <span>AI Assistant</span>
                        </div>
                    )}
                    <button 
                        className={styles.toggleBtn} 
                        onClick={() => setIsCollapsed(!isCollapsed)}
                    >
                        <MenuIcon />
                    </button>
                </div>

                <button className={styles["new-chat-btn"]} onClick={handleNewChat}>
                    <PlusIcon />
                    {!isCollapsed && <span>New Chat</span>}
                </button>
            </div>

            <div className={styles.middle}>
                <div className={styles["nav-section"]}>
                    <div
                        className={`${styles.option} ${viewMode === 'chat' ? styles.active : ''}`}
                        onClick={() => setViewMode && setViewMode('chat')}
                        style={{ cursor: 'pointer' }}
                    >
                        <ChatIcon />
                        {!isCollapsed && <span>Recent Chat</span>}
                    </div>
                    <div
                        className={`${styles.option} ${viewMode === 'cad_studio' ? styles.active : ''}`}
                        onClick={() => setViewMode && setViewMode('cad_studio')}
                        style={{ cursor: 'pointer' }}
                    >
                        <span>📐</span>
                        {!isCollapsed && <span>3D CAD Studio</span>}
                    </div>
                </div>
                
                {!isCollapsed && (
                    <div className={styles["history-list"]}>
                        <p className={styles.label}>Recent Chats</p>
                        {chats.length > 0 ? (
                            chats.map(chat => (
                                <div 
                                    key={chat.chatId} 
                                    className={`${styles["history-item"]} ${activeChatId === chat.chatId ? styles.activeItem : ''}`}
                                    onClick={() => setActiveChatId(chat.chatId)}
                                >
                                    {chat.title?.trim() || "New Chat"}
                                </div>
                            ))
                        ) : (
                            <p className={styles.emptyLabel}>No recent chats</p>
                        )}
                    </div>
                )}
            </div>

            <div className={styles.bottom}>
                <div className={styles.option}>
                    <HelpIcon />
                    {!isCollapsed && <span>Help & Support</span>}
                </div>
                {/* Logout Button */}
                <div className={styles.option} onClick={onLogout} style={{ cursor: 'pointer' }}>
                   <SettingsIcon />
                    {!isCollapsed && <span>Logout</span>}
                </div>
                
                {!isCollapsed && <hr className={styles.divider} />}
                
                <div className={styles.profile}>
                    <div className={styles.avatar}>
                        <UserIcon />
                    </div>
                    {!isCollapsed && (
                        <div className={styles.userInfo}>
                            <p className={styles.name}>{user.username}</p>
                            <p className={styles.email}>{user.email}</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

export default Sidebar