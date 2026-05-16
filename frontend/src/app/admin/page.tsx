"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { Post, Report } from "@/lib/posts";
import {
  adminActOnPost,
  adminAddAdmin,
  adminFetchPosts,
  adminFetchReports,
  adminFetchAdmins,
  adminRemoveAdmin,
  adminResolveReport,
  adminSetTicketStatus,
  clearAdminToken,
  formatRelativeTime,
  hasAdminToken,
  isSuperAdmin,
} from "@/lib/posts";
import { categoryLabel, ticketStatusLabel } from "@/lib/categories";
import styles from "./page.module.css";

type Tab = "posts" | "reports" | "users";

const TICKET_STATUS_OPTIONS = [
  { value: "open", label: "待处理" },
  { value: "processing", label: "处理中" },
  { value: "completed", label: "已完成" },
  { value: "closed", label: "已关闭" },
];

type AdminUser = {
  id: number;
  username: string;
  nickname: string;
  role: string;
  created_at: string;
};

export default function AdminDashboardPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("posts");
  const [posts, setPosts] = useState<Post[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [postStatus, setPostStatus] = useState<string>("");
  const [reportFilter, setReportFilter] = useState<boolean | undefined>(undefined);
  const [newUsername, setNewUsername] = useState("");
  const superAdmin = isSuperAdmin();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!hasAdminToken()) { router.push("/admin/login"); return; }
    loadData();
  }, [tab, postStatus, reportFilter]);

  const loadData = async () => {
    setLoading(true); setError(null);
    try {
      if (tab === "posts") setPosts(await adminFetchPosts(postStatus || undefined));
      else if (tab === "reports") setReports(await adminFetchReports(reportFilter));
      else if (tab === "users") setUsers(await adminFetchAdmins());
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    } finally { setLoading(false); }
  };

  const handleActOnPost = async (postId: number, action: string) => {
    try { await adminActOnPost(postId, action); loadData(); }
    catch (e) { setError(e instanceof Error ? e.message : "操作失败"); }
  };

  const handleResolveReport = async (reportId: number, resolved: boolean) => {
    try { await adminResolveReport(reportId, resolved); loadData(); }
    catch (e) { setError(e instanceof Error ? e.message : "操作失败"); }
  };

  const handleTicketStatus = async (postId: number, status: string) => {
    try { await adminSetTicketStatus(postId, status); loadData(); }
    catch (e) { setError(e instanceof Error ? e.message : "操作失败"); }
  };

  const handleAddAdmin = async () => {
    const name = newUsername.trim();
    if (!name) return;
    try { await adminAddAdmin(name); setNewUsername(""); loadData(); inputRef.current?.focus(); }
    catch (e) { setError(e instanceof Error ? e.message : "添加失败"); }
  };

  const handleRemoveAdmin = async (userId: number, username: string) => {
    if (!confirm(`确定移除管理员 ${username} 吗？`)) return;
    try { await adminRemoveAdmin(userId); loadData(); }
    catch (e) { setError(e instanceof Error ? e.message : "移除失败"); }
  };

  const handleLogout = () => { clearAdminToken(); router.push("/admin/login"); };

  const tabs: Tab[] = superAdmin ? ["posts", "reports", "users"] : ["posts", "reports"];

  return (
    <main className={styles.main}>
      <div className={styles.header}>
        <h1 className={styles.title}>管理后台</h1>
        <button className={styles.logout} onClick={handleLogout}>退出登录</button>
      </div>

      <div className={styles.tabs}>
        {tabs.map((t) => (
          <button key={t} className={`${styles.tab} ${tab === t ? styles.tabActive : ""}`} onClick={() => setTab(t)}>
            {t === "posts" ? "帖子管理" : t === "reports" ? "举报管理" : "用户管理"}
          </button>
        ))}
      </div>

      {tab === "posts" && (
        <div className={styles.filterRow}>
          <select className={styles.select} value={postStatus} onChange={(e) => setPostStatus(e.target.value)}>
            <option value="">全部状态</option>
            <option value="approved">已通过</option>
            <option value="pending">待审核</option>
            <option value="rejected">已拒绝</option>
          </select>
        </div>
      )}
      {tab === "reports" && (
        <div className={styles.filterRow}>
          <select className={styles.select} value={reportFilter === undefined ? "all" : String(reportFilter)} onChange={(e) => { const v = e.target.value; setReportFilter(v === "all" ? undefined : v === "true"); }}>
            <option value="all">全部</option>
            <option value="false">未处理</option>
            <option value="true">已处理</option>
          </select>
        </div>
      )}

      {error ? <p className={styles.errorMsg}>{error}</p> : loading ? <p className={styles.loading}>加载中…</p> : tab === "posts" ? (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead><tr><th>ID</th><th>标题</th><th>分区</th><th>状态</th><th>工单状态</th><th>浏览</th><th>点赞</th><th>时间</th><th>操作</th></tr></thead>
            <tbody>
              {posts.map((p) => (
                <tr key={p.id}>
                  <td className={styles.mono}>#{p.id}</td>
                  <td><Link href={`/post/${p.id}`} className={styles.postLink}>{p.title.slice(0, 30)}{p.title.length > 30 ? "…" : ""}</Link></td>
                  <td className={styles.muted}>{categoryLabel(p.category)}</td>
                  <td><span className={`${styles.statusTag} ${p.status === "approved" ? styles.statusApproved : p.status === "pending" ? styles.statusPending : styles.statusRejected}`}>{p.status === "approved" ? "已通过" : p.status === "pending" ? "待审核" : "已拒绝"}</span></td>
                  <td>
                    {p.category === "ticket" ? (
                      <select
                        className={styles.select}
                        value={p.ticket_status ?? "open"}
                        onChange={(e) => handleTicketStatus(p.id, e.target.value)}
                        style={{ fontSize: "0.7rem", padding: "0.15rem 0.3rem" }}
                      >
                        {TICKET_STATUS_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    ) : <span className={styles.muted}>—</span>}
                  </td>
                  <td className={styles.mono}>{p.view_count}</td>
                  <td className={styles.mono}>{p.like_count}</td>
                  <td className={styles.muted}>{formatRelativeTime(p.created_at)}</td>
                  <td>
                    <div className={styles.actionBtns}>
                      {p.status !== "approved" && <button className={styles.btnApprove} onClick={() => handleActOnPost(p.id, "approve")}>通过</button>}
                      {p.status !== "rejected" && <button className={styles.btnReject} onClick={() => handleActOnPost(p.id, "reject")}>拒绝</button>}
                      <button className={styles.btnDelete} onClick={() => { if (confirm(`确定删除帖子 #${p.id}？`)) handleActOnPost(p.id, "delete"); }}>删除</button>
                    </div>
                  </td>
                </tr>
              ))}
              {posts.length === 0 && <tr><td colSpan={9} className={styles.empty}>暂无数据</td></tr>}
            </tbody>
          </table>
        </div>
      ) : tab === "reports" ? (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead><tr><th>ID</th><th>帖子ID</th><th>举报原因</th><th>举报人</th><th>时间</th><th>状态</th><th>操作</th></tr></thead>
            <tbody>
              {reports.map((r) => (
                <tr key={r.id}>
                  <td className={styles.mono}>#{r.id}</td>
                  <td className={styles.mono}><Link href={`/post/${r.post_id}`} className={styles.postLink}>#{r.post_id}</Link></td>
                  <td>{r.reason}</td>
                  <td className={styles.muted}>{r.fingerprint.slice(0, 8)}…</td>
                  <td className={styles.muted}>{formatRelativeTime(r.created_at)}</td>
                  <td>{r.resolved ? "已处理" : "未处理"}</td>
                  <td>{!r.resolved ? <div className={styles.actionBtns}><button className={styles.btnApprove} onClick={() => handleResolveReport(r.id, true)}>标记已处理</button></div> : <span className={styles.muted}>已处理</span>}</td>
                </tr>
              ))}
              {reports.length === 0 && <tr><td colSpan={7} className={styles.empty}>暂无数据</td></tr>}
            </tbody>
          </table>
        </div>
      ) : (
        <div>
          <div className={styles.filterRow} style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <input
              ref={inputRef}
              className={styles.select}
              style={{ flex: 1, maxWidth: "24rem" }}
              type="text"
              value={newUsername}
              onChange={(e) => setNewUsername(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleAddAdmin(); }}
              placeholder="输入用户名以添加为管理员"
            />
            <button className={styles.btnApprove} onClick={handleAddAdmin}>添加</button>
          </div>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead><tr><th>ID</th><th>用户名</th><th>昵称</th><th>角色</th><th>添加时间</th><th>操作</th></tr></thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td className={styles.mono}>#{u.id}</td>
                    <td>{u.username}</td>
                    <td>{u.nickname}</td>
                    <td>{u.role === "admin" ? "管理员" : u.role}</td>
                    <td className={styles.muted}>{formatRelativeTime(u.created_at)}</td>
                    <td>
                      <button className={styles.btnDelete} onClick={() => handleRemoveAdmin(u.id, u.username)}>移除</button>
                    </td>
                  </tr>
                ))}
                {users.length === 0 && <tr><td colSpan={5} className={styles.empty}>暂无管理员</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </main>
  );
}
