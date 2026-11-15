/**
 * Shared handlers for airport-level subscription grouping actions emitted by SubscriptionPanel.
 */
export function useAirportGroupActions({ subscriptions, updateSubscription, showToast, t }) {
    const applyAirportIdentity = (ids, identity) => {
        const groupId = String(identity?.groupId || '').trim();
        const name = String(identity?.name || '').trim();
        const split = Boolean(identity?.split);
        if (!groupId || !name || !Array.isArray(ids)) return;
        ids.forEach((id) => {
            const target = subscriptions.value.find((sub) => sub.id === id);
            if (target) {
                updateSubscription({
                    ...target,
                    airportIdentity: split ? { groupId, name, split: true } : { groupId, name },
                });
            }
        });
    };

    const handleAssignAirportGroup = (ids, identity) => {
        applyAirportIdentity(ids, identity);
    };

    const handleSplitAirportGroup = (ids, identity) => {
        applyAirportIdentity(ids, identity);
    };

    const handleResetAirportIdentity = (ids) => {
        (ids || []).forEach((id) => {
            const target = subscriptions.value.find((sub) => sub.id === id);
            if (target) updateSubscription({ ...target, airportIdentity: null });
        });
        showToast(t('subscriptions.airportIdentityReset'), 'success');
    };

    return {
        handleAssignAirportGroup,
        handleSplitAirportGroup,
        handleResetAirportIdentity,
    };
}
