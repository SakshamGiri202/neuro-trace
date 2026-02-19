from django.urls import path
from .views import UploadTransactionsView, HashReportView, AllRingsView, RingDetailView, AccountDetailView

urlpatterns = [
    path('upload', UploadTransactionsView.as_view(), name='upload_csv'),
    path('hash-report', HashReportView.as_view(), name='hash_report'),
    path('rings', AllRingsView.as_view(), name='all_rings'),
    path('rings/<str:ring_id>', RingDetailView.as_view(), name='ring_detail'),
    path('accounts/<str:account_id>', AccountDetailView.as_view(), name='account_detail'),
]
