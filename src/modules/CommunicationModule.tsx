import React, { useCallback, useEffect, useState } from 'react';
import { Megaphone, Send } from 'lucide-react';
import { toast } from 'sonner';
import { apiFetch } from '../lib/api';
import { formatDateShort } from '../lib/utils';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Input, Label, SelectInput, Textarea } from '../components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';

export const CommunicationModule: React.FC = () => {
  const { schoolSettings, hasPermission } = useAuth();
  const canPublish = hasPermission('comms.manage');

  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [messages, setMessages] = useState<any[]>([]);
  const [recipients, setRecipients] = useState<any[]>([]);

  const [annOpen, setAnnOpen] = useState(false);
  const [annForm, setAnnForm] = useState({
    title: '',
    content: '',
    category: 'GENERAL',
    targetAudience: 'ALL',
    eventDate: '',
  });

  const [msgForm, setMsgForm] = useState({ recipientUserId: '', subject: '', body: '' });

  const loadComms = useCallback(async () => {
    try {
      const [anns, msgs, recips] = await Promise.all([
        apiFetch<any[]>('/api/communication/announcements'),
        apiFetch<any[]>('/api/communication/messages'),
        apiFetch<any[]>('/api/communication/recipients'),
      ]);
      setAnnouncements(anns);
      setMessages(msgs);
      setRecipients(recips);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to load communications.');
    }
  }, []);

  useEffect(() => {
    loadComms();
  }, [loadComms]);

  const handlePublishAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/communication/announcements', {
        method: 'POST',
        body: JSON.stringify(annForm),
      });
      toast.success('Announcement published and users notified.');
      setAnnOpen(false);
      setAnnForm({ title: '', content: '', category: 'GENERAL', targetAudience: 'ALL', eventDate: '' });
      loadComms();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to publish announcement.');
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/communication/messages', {
        method: 'POST',
        body: JSON.stringify({
          recipientUserId: Number(msgForm.recipientUserId),
          subject: msgForm.subject,
          body: msgForm.body,
        }),
      });
      toast.success('Message sent.');
      setMsgForm({ recipientUserId: '', subject: '', body: '' });
      loadComms();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to send message.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Communication & Notices</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            School announcements, parent & teacher notices, internal messaging, and delivery gateway status
          </p>
        </div>
        {canPublish && (
          <Button size="sm" onClick={() => setAnnOpen(true)}>
            <Megaphone className="h-4 w-4" />
            Publish Announcement
          </Button>
        )}
      </div>

      <Tabs defaultValue="announcements">
        <TabsList>
          <TabsTrigger value="announcements">School Announcements</TabsTrigger>
          <TabsTrigger value="messages">Internal Messaging</TabsTrigger>
          <TabsTrigger value="channels">Email & SMS Channels</TabsTrigger>
        </TabsList>

        <TabsContent value="announcements" className="space-y-4">
          {announcements.map((a) => (
            <Card key={a.id}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle>{a.title}</CardTitle>
                  <span className="text-xs font-mono text-slate-400">{formatDateShort(a.createdAt)}</span>
                </div>
                <CardDescription>
                  {a.category} · Audience: {a.targetAudience} · By {a.authorName}
                  {a.eventDate ? ` · Event Date: ${a.eventDate}` : ''}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">{a.content}</p>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="messages" className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="lg:col-span-1">
            <CardHeader>
              <CardTitle>Compose Internal Message</CardTitle>
              <CardDescription>Direct encrypted staff & parent portal messaging</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSendMessage} className="space-y-3">
                <div>
                  <Label>Recipient *</Label>
                  <SelectInput
                    required
                    value={msgForm.recipientUserId}
                    onChange={(e) => setMsgForm({ ...msgForm, recipientUserId: e.target.value })}
                  >
                    <option value="">Select User</option>
                    {recipients.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.fullName} ({r.roleName})
                      </option>
                    ))}
                  </SelectInput>
                </div>
                <div>
                  <Label>Subject *</Label>
                  <Input
                    required
                    value={msgForm.subject}
                    onChange={(e) => setMsgForm({ ...msgForm, subject: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Message *</Label>
                  <Textarea
                    required
                    value={msgForm.body}
                    onChange={(e) => setMsgForm({ ...msgForm, body: e.target.value })}
                  />
                </div>
                <Button type="submit" size="sm" className="w-full">
                  <Send className="h-3.5 w-3.5" />
                  Send Message
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Message History ({messages.length})</CardTitle>
              <CardDescription>Inbox and sent correspondence</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {messages.length === 0 ? (
                <p className="text-sm text-slate-500 py-8 text-center">No internal messages yet.</p>
              ) : (
                messages.map((m) => (
                  <div key={m.id} className="p-3 rounded border border-slate-200 dark:border-slate-800 space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="font-semibold">{m.subject}</span>
                      <span className="font-mono text-slate-400">{formatDateShort(m.createdAt)}</span>
                    </div>
                    <p className="text-xs text-slate-500">
                      From: {m.senderName} → To: {m.recipientName}
                    </p>
                    <p className="text-sm text-slate-700 dark:text-slate-300 pt-1">{m.body}</p>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="channels" className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle>SMTP Email Gateway</CardTitle>
              <CardDescription>External guardian & staff email delivery integration</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p>
                Status:{' '}
                <span className="font-semibold">
                  {schoolSettings?.emailConfigured ? 'Configured & Active' : 'Awaiting SMTP Credentials'}
                </span>
              </p>
              <p className="text-xs text-slate-500">
                Configure <code>SMTP_HOST</code>, <code>SMTP_PORT</code>, <code>SMTP_USER</code>, and{' '}
                <code>SMTP_PASS</code> in server environment variables to enable live email dispatch.
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>SMS Dispatch Gateway</CardTitle>
              <CardDescription>Absentee and fee balance SMS alerts</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p>
                Status:{' '}
                <span className="font-semibold">
                  {schoolSettings?.smsConfigured ? 'Configured & Active' : 'Awaiting SMS API Key'}
                </span>
              </p>
              <p className="text-xs text-slate-500">
                Configure <code>SMS_API_KEY</code>, <code>SMS_USERNAME</code>, and <code>SMS_SENDER_ID</code> in
                server secrets to activate live parent SMS alerts.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={annOpen} onOpenChange={setAnnOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Publish School Announcement</DialogTitle>
          </DialogHeader>
          <form onSubmit={handlePublishAnnouncement} className="space-y-3">
            <div>
              <Label>Title *</Label>
              <Input required value={annForm.title} onChange={(e) => setAnnForm({ ...annForm, title: e.target.value })} />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Category</Label>
                <SelectInput value={annForm.category} onChange={(e) => setAnnForm({ ...annForm, category: e.target.value })}>
                  <option value="GENERAL">General</option>
                  <option value="ACADEMIC">Academic</option>
                  <option value="EVENT">Event</option>
                  <option value="FINANCE">Finance</option>
                </SelectInput>
              </div>
              <div>
                <Label>Target Audience</Label>
                <SelectInput value={annForm.targetAudience} onChange={(e) => setAnnForm({ ...annForm, targetAudience: e.target.value })}>
                  <option value="ALL">All Users</option>
                  <option value="STUDENTS">Students</option>
                  <option value="PARENTS">Parents / Guardians</option>
                  <option value="TEACHERS">Teachers</option>
                  <option value="STAFF">All Staff</option>
                </SelectInput>
              </div>
              <div>
                <Label>Event Date</Label>
                <Input type="date" value={annForm.eventDate} onChange={(e) => setAnnForm({ ...annForm, eventDate: e.target.value })} />
              </div>
            </div>
            <div>
              <Label>Notice Content *</Label>
              <Textarea required rows={4} value={annForm.content} onChange={(e) => setAnnForm({ ...annForm, content: e.target.value })} />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setAnnOpen(false)}>Cancel</Button>
              <Button type="submit">Publish Notice</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};
