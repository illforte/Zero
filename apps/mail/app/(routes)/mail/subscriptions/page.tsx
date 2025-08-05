'use client';

import {
  categoryColors,
  categoryLabels,
  useSubscriptions,
  type SubscriptionCategory,
  type SubscriptionItem,
} from '@/hooks/use-subscriptions';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { EmptyStateIcon } from '@/components/icons/empty-state-svg';
import { SidebarToggle } from '@/components/ui/sidebar-toggle';
import { Search, XCircle } from '@/components/icons/icons';
import { BimiAvatar } from '@/components/ui/bimi-avatar';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { RefreshCcw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { cn, formatDate } from '@/lib/utils';
import { VList } from 'virtua';

function SubscriptionItemComponent({
  subscription,
  onUnsubscribe,
  // onResubscribe,
  isLoading,
}: {
  subscription: SubscriptionItem;
  onUnsubscribe: (id: string) => void;
  // onResubscribe: (id: string) => void;
  isLoading: boolean;
}) {
  const getDomainIcon = () => {
    return (
      <BimiAvatar
        email={subscription.senderEmail}
        name={subscription.senderName || subscription.senderEmail}
        className={cn('h-8 w-8 rounded-full', 'border')}
      />
    );
  };

  return (
    <Card className="mb-3 rounded-xl border-none bg-neutral-900 shadow-none">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          {getDomainIcon()}

          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1">
                <h3 className="truncate text-sm font-medium">
                  {subscription.senderName || subscription.senderEmail}
                </h3>
                <p className="text-muted-foreground truncate text-xs">{subscription.senderEmail}</p>
              </div>

              <div className="flex items-center gap-2">
                <Badge
                  variant="secondary"
                  className={cn(
                    'text-xs',
                    categoryColors[subscription.category as SubscriptionCategory],
                  )}
                >
                  {categoryLabels[subscription.category as SubscriptionCategory]}
                </Badge>

                {subscription.isActive ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onUnsubscribe(subscription.id)}
                    disabled={isLoading}
                    className="h-8 rounded-lg px-2 text-red-400 hover:text-red-500"
                  >
                    <XCircle className="h-4 w-4" />
                    Unsubscribe
                  </Button>
                ) : // <Button
                //   variant="ghost"
                //   size="sm"
                //   onClick={() => onResubscribe(subscription.id)}
                //   disabled={isLoading}
                //   className="h-8 rounded-lg px-2"
                // >
                //   <Mail className="mr-1 h-4 w-4" />
                //   Resubscribe
                // </Button>
                null}
              </div>
            </div>

            <div className="text-muted-foreground mt-2 flex items-center gap-4 text-xs">
              <span>{subscription.emailCount} emails</span>
              <span>Last: {formatDate(new Date(subscription.lastEmailReceivedAt))}</span>
              {subscription.metadata?.lastSubject && (
                <span className="max-w-xs truncate">"{subscription.metadata.lastSubject}"</span>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function SubscriptionsPage() {
  const {
    subscriptions,
    selectedIds,
    isLoading,
    isUnsubscribing,
    isResubscribing,
    isBulkUnsubscribing,
    searchQuery,
    categoryFilter,
    activeFilter,
    setSearchQuery,
    setCategoryFilter,
    setActiveFilter,
    handleUnsubscribe,
    // handleResubscribe,
    handleBulkUnsubscribe,
    refetch,
  } = useSubscriptions();

  return (
    <div className="rounded-inherit relative z-[5] flex p-0 md:my-1 md:mr-1">
      <div className="rounded-inherit h-full w-full overflow-hidden">
        <div className="bg-panelLight dark:bg-panelDark block w-full shadow-sm md:mr-[3px] md:rounded-2xl lg:flex lg:h-[calc(100dvh-8px)] lg:shadow-sm">
          <div className="w-full md:h-[calc(100dvh-10px)]">
            <div className="relative z-[1] h-[calc(100dvh-(2px+2px))] w-full overflow-hidden pt-0">
              <div>
                <div
                  className={cn(
                    'sticky top-0 z-[15] flex items-center justify-between gap-1.5 p-2 pb-0 transition-colors',
                  )}
                >
                  <div className="w-full">
                    <div className="mt-1 flex flex-col justify-between gap-2 px-2 md:flex-row md:px-0">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <SidebarToggle className="col-span-1 h-fit w-10 px-2" />
                          <h1 className="text-lg font-semibold">Subscriptions</h1>
                        </div>
                        <Button
                          onClick={() => refetch()}
                          variant="ghost"
                          className="block md:hidden md:h-fit md:px-2"
                        >
                          <RefreshCcw className="text-muted-foreground h-4 w-4 cursor-pointer" />
                        </Button>
                      </div>

                      <div className="flex items-center gap-2">
                        <div className="relative flex-1">
                          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 fill-[#71717A] dark:fill-[#6F6F6F]" />
                          <Input
                            placeholder="Search..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="h-9 rounded-lg border-none p-0 pl-9 dark:bg-[#141414]"
                          />
                        </div>

                        <Select
                          value={categoryFilter}
                          onValueChange={(v) => setCategoryFilter(v as any)}
                        >
                          <SelectTrigger className="w-[100px] rounded-lg md:w-[120px]">
                            <SelectValue placeholder="Category" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All Categories</SelectItem>
                            {Object.entries(categoryLabels).map(([value, label]) => (
                              <SelectItem key={value} value={value}>
                                {label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>

                        <Select
                          value={activeFilter}
                          onValueChange={(v) => setActiveFilter(v as any)}
                        >
                          <SelectTrigger className="w-[92px] rounded-lg md:w-[110px]">
                            <SelectValue placeholder="Status" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All</SelectItem>
                            <SelectItem value="active">Active</SelectItem>
                            <SelectItem value="inactive">Unsubscribed</SelectItem>
                          </SelectContent>
                        </Select>

                        {selectedIds.size > 0 && (
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={handleBulkUnsubscribe}
                            disabled={isBulkUnsubscribing}
                          >
                            <Trash2 className="mr-1 h-4 w-4" />
                            Unsubscribe ({selectedIds.size})
                          </Button>
                        )}
                        <Button
                          onClick={() => refetch()}
                          variant="ghost"
                          className="hidden md:block md:h-fit md:px-2"
                        >
                          <RefreshCcw className="text-muted-foreground h-4 w-4 cursor-pointer" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex h-[calc(100dvh-62px)] flex-col overflow-auto p-4">
                {isLoading ? (
                  <div className="space-y-3">
                    {[...Array(5)].map((_, i) => (
                      <Card key={`skeleton-${i}`}>
                        <CardContent className="p-4">
                          <Skeleton className="h-16 w-full" />
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                ) : subscriptions.length === 0 ? (
                  <div className="flex h-full items-center justify-center">
                    <div className="flex flex-col items-center justify-center gap-2 text-center">
                      <EmptyStateIcon width={200} height={200} />
                      <h3 className="mt-4 text-lg font-medium">No subscriptions found</h3>
                      <p className="text-muted-foreground text-sm">
                        {searchQuery
                          ? 'Try adjusting your search or filters'
                          : 'Your subscriptions will appear here as they are detected'}
                      </p>
                    </div>
                  </div>
                ) : (
                  <VList className="w-full flex-1">
                    {subscriptions.map((subscription: SubscriptionItem) => (
                      <SubscriptionItemComponent
                        key={subscription.id}
                        subscription={subscription}
                        onUnsubscribe={handleUnsubscribe}
                        // onResubscribe={handleResubscribe}
                        isLoading={isUnsubscribing || isResubscribing}
                      />
                    ))}
                  </VList>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
