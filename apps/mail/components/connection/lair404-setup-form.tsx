import { linkLair404Schema, type LinkLair404Data } from '@/lib/schemas';
import { useTRPC } from '@/providers/query-provider';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { Button } from '../ui/button';
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage
} from '../ui/form';
import { Input } from '../ui/input';

export const Lair404SetupForm = ({ onSuccess }: { onSuccess: () => void }) => {
  const trpc = useTRPC();
  const [isLoading, setIsLoading] = useState(false);

  const form = useForm<LinkLair404Data>({
    resolver: zodResolver(linkLair404Schema),
    defaultValues: {
      email: '',
      password: '',
      imapHost: 'mail.lair404.xyz',
      imapPort: 993,
      smtpHost: 'mail.lair404.xyz',
      smtpPort: 587,
    },
  });

  const onSubmit = async (data: LinkLair404Data) => {
    setIsLoading(true);
    try {
      await trpc.connections.linkLair404.mutate(data);
      toast.success('Lair404 connection added successfully');
      onSuccess();
    } catch (error) {
      console.error('Failed to link Lair404:', error);
      toast.error('Failed to link Lair404 connection');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email Address</FormLabel>
              <FormControl>
                <Input placeholder="yourname@lair404.xyz" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Password</FormLabel>
              <FormControl>
                <Input type="password" placeholder="••••••••" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="imapHost"
            render={({ field }) => (
              <FormItem>
                <FormLabel>IMAP Host</FormLabel>
                <FormControl>
                  <Input {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="imapPort"
            render={({ field }) => (
              <FormItem>
                <FormLabel>IMAP Port</FormLabel>
                <FormControl>
                  <Input type="number" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="smtpHost"
            render={({ field }) => (
              <FormItem>
                <FormLabel>SMTP Host</FormLabel>
                <FormControl>
                  <Input {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="smtpPort"
            render={({ field }) => (
              <FormItem>
                <FormLabel>SMTP Port</FormLabel>
                <FormControl>
                  <Input type="number" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <Button type="submit" className="w-full bg-[#00D2FF] hover:bg-[#00B8E6] text-white" disabled={isLoading}>
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Connecting...
            </>
          ) : (
            'Link Account'
          )}
        </Button>
        <p className="text-[10px] text-center text-muted-foreground mt-4 uppercase tracking-widest font-bold">
          Powered by Lair404 Security
        </p>
      </form>
    </Form>
  );
};
